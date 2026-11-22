"""Genera un SQL amministrativo privato: non si collega a Supabase."""
from __future__ import annotations

import argparse
import csv
from datetime import datetime
import hashlib
import io
import json
from pathlib import Path
import re
from uuid import UUID, uuid5
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[2]
NAMESPACE = UUID('29e0904b-cf55-5cc9-99c3-f572c2c4f786')
REQUIRED = {'cognome', 'nome', 'email', 'telefono', 'data_nascita', 'eta', 'r_capacita',
            'rentall_privacy', 'lingua', 'stato', 'tot_articoli_noleggiati', 'pagato', 'visite', 'stagionale'}
LEVELS = {'PRINCIPIANTE': 'beginner', 'INTERMEDIO': 'intermediate', 'ESPERTO': 'expert'}


def sql_text(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def optional(value: str) -> str | None:
    return value if value.strip() else None


def load_csv(source: Path) -> dict:
    original = source.read_bytes()
    digest = hashlib.sha256(original).hexdigest()
    reader = csv.reader(io.StringIO(original.decode('utf-8-sig')), delimiter=',')
    headers = next(reader)
    if set(headers) - {''} != REQUIRED or len(headers) != len(set(headers)):
        raise ValueError('Intestazioni CSV inattese: nessun dato generato.')
    batch_id = str(uuid5(NAMESPACE, digest))
    records = []
    empty_names = numeric_names = 0
    today = datetime.now(ZoneInfo('Europe/Rome')).date()
    for source_row, values in enumerate(reader, 1):
        if not values:  # Una linea fisicamente vuota non rappresenta una riga CSV.
            continue
        if len(values) != len(headers):
            raise ValueError(f'Numero colonne non valido alla riga dati {source_row}.')
        raw = dict(zip(headers, values, strict=True))
        birth_date = None
        if raw['data_nascita'].strip():
            try:
                date = datetime.strptime(raw['data_nascita'].strip(), '%d/%m/%Y').date()
            except ValueError as error:
                raise ValueError(f'Data di nascita non valida alla riga dati {source_row}.') from error
            if date > today:
                raise ValueError(f'Data di nascita futura alla riga dati {source_row}.')
            birth_date = date.isoformat()
        level = raw['r_capacita'].strip().upper()
        if level and level not in LEVELS:
            raise ValueError(f'Livello inatteso alla riga dati {source_row}.')
        codes = {key: raw[key].strip().upper() or None for key in ['lingua', 'stato']}
        if any(value and not re.fullmatch('[A-Z]{2}', value) for value in codes.values()):
            raise ValueError(f'Codice lingua/paese inatteso alla riga dati {source_row}.')
        empty_names += int(not raw['nome'].strip() or not raw['cognome'].strip())
        numeric_names += int(any(re.fullmatch(r'\d+', raw[key].strip()) for key in ['nome', 'cognome']))
        records.append({
            'source_row': source_row,
            'customer_id': str(uuid5(NAMESPACE, f'{digest}:{source_row}')),
            'raw_data': raw,
            'birth_date': birth_date,
            'skill_level': LEVELS.get(level),
            'language': codes['lingua'],
            'country_code': codes['stato'],
        })
    if not records:
        raise ValueError('CSV senza righe dati.')
    return {'batch_id': batch_id, 'source_filename': source.name, 'source_sha256': digest,
            'headers': headers, 'records': records,
            'summary': {'rows': len(records), 'rows_with_missing_name': empty_names,
                        'rows_with_numeric_name': numeric_names, 'rows_excluded': 0}}


def migration_body(name: str) -> str:
    lines = (ROOT / 'backend' / 'sql' / name).read_text().splitlines()
    return '\n'.join(line for line in lines if line.strip().lower() not in ('begin;', 'commit;'))


def render_sql(data: dict, selected: list[dict] | None = None, include_schema: bool = True, verify_total: bool = True) -> str:
    batch_id = sql_text(data['batch_id'])
    digest = sql_text(data['source_sha256'])
    selected = data['records'] if selected is None else selected
    # Le intestazioni sono condivise: le celle restano identiche, senza ripetere
    # quindici nomi di colonna per ognuna delle migliaia di righe.
    compact = [[r['source_row'], r['customer_id'], list(r['raw_data'].values()),
                r['birth_date'], r['skill_level'], r['language'], r['country_code']] for r in selected]
    records = sql_text(json.dumps(compact, ensure_ascii=False, separators=(',', ':')))
    headers = sql_text(json.dumps(data['headers'], ensure_ascii=False))
    count = len(data['records'])
    schema = (migration_body('015_customer_profile_fields.sql') + '\n' +
              migration_body('016_legacy_customer_import.sql')) if include_schema else ''
    if verify_total:
        condition, expected = '', count
    else:
        condition = f" and source_row between {selected[0]['source_row']} and {selected[-1]['source_row']}"
        expected = len(selected)
    # Stringhe SQL quotate; niente sostituzioni shell o esecuzione dei valori CSV.
    return f'''-- DATI CLIENTI PRIVATI: non pubblicare o aggiungere al repository.
-- Eseguire TUTTO nel SQL Editor di Supabase, come le altre importazioni.
-- {len(selected)} righe in questo file, {count} nel CSV completo. Nessuna riga scartata.
-- Rieseguire lo stesso file non duplica né sovrascrive i clienti già importati.
begin;
set local standard_conforming_strings = on;
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('skirenting_customer_import',0));
{schema}
insert into public.customer_import_batches(id,source_filename,source_sha256,source_headers,row_count)
  values({batch_id},{sql_text(data['source_filename'])},{digest},{headers}::jsonb,{count})
  on conflict (source_sha256) do nothing;

with incoming as materialized (
  select (entry.value->>0)::integer as source_row, (entry.value->>1)::uuid as customer_id,
    (select jsonb_object_agg(h.key,entry.value->2->((h.position-1)::integer))
       from jsonb_array_elements_text({headers}::jsonb) with ordinality as h(key,position)) as raw_data,
    (entry.value->>3)::date as birth_date, entry.value->>4 as skill_level,
    entry.value->>5 as language, entry.value->>6 as country_code
  from jsonb_array_elements({records}::jsonb) as entry(value)
), inserted as (
  insert into public.customers(id,first_name,last_name,email,phone,birth_date,skill_level,language,country_code,is_legacy)
    select customer_id,raw_data->>'nome',raw_data->>'cognome',
      case when btrim(raw_data->>'email')='' then null else raw_data->>'email' end,
      case when btrim(raw_data->>'telefono')='' then null else raw_data->>'telefono' end,
      birth_date,skill_level,language,country_code,true from incoming
    on conflict (id) do nothing returning id
)
insert into public.customer_import_rows(batch_id,source_row,customer_id,raw_data)
  select {batch_id},source_row,customer_id,raw_data from incoming
  cross join (select count(*) from inserted) completed_insert
  on conflict (batch_id,source_row) do nothing;

do $verify$
begin
  if (select count(*) from public.customer_import_rows where batch_id={batch_id}{condition}) <> {expected} then
    raise exception 'Importazione incompleta: eseguire i blocchi precedenti e riprovare. Questo file non e stato salvato.';
  end if;
end;
$verify$;
commit;

select b.source_filename,b.row_count as righe_attese,count(r.customer_id) as clienti_importati
  from public.customer_import_batches b join public.customer_import_rows r on r.batch_id=b.id
  where b.id={batch_id} group by b.id;
'''



def render_blocks(data: dict, chunk_size: int = 500) -> dict[str, str]:
    if chunk_size <= 0:
        raise ValueError('La dimensione del blocco deve essere positiva.')
    result = {}
    rows = data['records']
    for index, start in enumerate(range(0, len(rows), chunk_size), 1):
        selected = rows[start:start + chunk_size]
        last = start + chunk_size >= len(rows)
        result[f'{index:02d}_clienti.sql'] = render_sql(
            data, selected=selected, include_schema=index == 1, verify_total=last,
        )
    return result

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--chunk-size', type=int, default=500)
    parser.add_argument('--output-dir', type=Path, default=ROOT / 'private' / 'customer-imports')
    args = parser.parse_args()
    data = load_csv(args.source)
    args.output_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    outputs = {
        'import_clienti.sql': render_sql(data),
        'riepilogo.json': json.dumps({key: value for key, value in data.items() if key not in ('headers','records')}, ensure_ascii=False, indent=2),
    }
    blocks = render_blocks(data, args.chunk_size)
    block_dir = args.output_dir / 'blocchi'
    block_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    for previous in block_dir.glob('[0-9][0-9]_clienti.sql'):
        previous.unlink()
    for name, content in blocks.items():
        path = block_dir / name
        path.write_text(content, encoding='utf-8')
        path.chmod(0o600)
    for name, content in outputs.items():
        path = args.output_dir / name
        path.write_text(content, encoding='utf-8')
        path.chmod(0o600)
    print(json.dumps(data['summary'], ensure_ascii=False))
    print(f"SQL compatto: {args.output_dir / 'import_clienti.sql'}")
    print(f"Blocchi SQL Editor: {len(blocks)}; massimo {max(len(s.encode('utf-8')) for s in blocks.values())} byte per file")


if __name__ == '__main__':
    main()
