"""Genera i CSV privati per le tabelle noleggio esistenti. Non accede a Supabase."""
import argparse
from collections import defaultdict
import csv
from decimal import Decimal
import json
from pathlib import Path
from uuid import uuid5

from local_trial import GROUP_COLUMNS, NAMESPACE, PERSON_COLUMNS, ROOT, date_value, load_source


def quote(value):
    return "'" + value.replace("'", "''") + "'"


def write_csv(path, columns, records):
    with path.open('w', encoding='utf-8', newline='') as stream:
        writer = csv.writer(stream, quoting=csv.QUOTE_NOTNULL)
        writer.writerow(columns)
        writer.writerows(records)
    path.chmod(0o600)


def generate(source: Path, output: Path, location='Madesimo'):
    rows, digest, size = load_source(source)
    batch_id = uuid5(NAMESPACE, digest)
    groups = defaultdict(list)
    for number, row in enumerate(rows, 1):
        groups[tuple(row[key] for key in GROUP_COLUMNS)].append((number, row))
    bookings, items, originals = [], [], []
    for key, entries in groups.items():
        booking_id = uuid5(NAMESPACE, digest + json.dumps(key, ensure_ascii=False))
        first = entries[0][1]
        paid = sum((Decimal(row['totale_pagato'].replace('.', '').replace(',', '.')) for _, row in entries), Decimal(0))
        customer_snapshot = {key: first[key] for key in PERSON_COLUMNS}
        customer_snapshot['albergo'] = ', '.join(sorted({row.get('albergo','') for _,row in entries if row.get('albergo','')}))
        snapshot = json.dumps(customer_snapshot, ensure_ascii=False)
        bookings.append((booking_id, True, True, batch_id, first['codice'], first['id_clienti'], snapshot,
                         date_value(first['data_uscita']), date_value(first['rientro_previsto']), 'imported', 'legacy', paid))
        for number, row in entries:
            item_id = uuid5(NAMESPACE, f'{digest}:item:{number}')
            items.append((item_id, booking_id, row['barcode'], row['marca'], row['modello'], row['value_it'],
                          date_value(row['data_rientro']), Decimal(row['totale_pagato'].replace('.', '').replace(',', '.'))))
            originals.append((batch_id, number, booking_id, item_id, json.dumps(row, ensure_ascii=False)))
    output.mkdir(parents=True, exist_ok=True, mode=0o700)
    write_csv(output / '02_prenotazioni.csv', ('id','is_legacy','legacy_paid_in_full','legacy_batch_id','legacy_code','legacy_customer_id','legacy_customer_snapshot','starts_on','ends_on','status','rental_kind','legacy_reported_paid_amount'), bookings)
    write_csv(output / '03_materiali_noleggiati.csv', ('id','booking_id','code_snapshot','brand_snapshot','model_snapshot','size_snapshot','legacy_returned_on','legacy_reported_paid_amount'), items)
    write_csv(output / '04_righe_originali.csv', ('batch_id','source_row','booking_id','item_id','raw_data'), originals)
    init = f'''-- Dopo backend/sql/030_import_legacy_rentals.sql.
begin;
do $$
declare site uuid; matches integer;
begin
  select count(*),(array_agg(id))[1] into matches,site from public.locations where lower(btrim(name))=lower({quote(location)});
  if matches<>1 then raise exception 'Sede importazione assente o ambigua. Controlla locations.'; end if;
  insert into public.rental_import_batches(id,source_filename,source_sha256,source_headers,expected_rows,expected_bookings,location_id)
    values('{batch_id}',{quote(source.name)},'{digest}',{quote(json.dumps(list(rows[0]),ensure_ascii=False))}::jsonb,{len(rows)},{len(groups)},site)
    on conflict(id) do nothing;
end; $$;
commit;
'''
    finalize = f"-- Solo dopo i tre CSV.\nselect public.skirenting_finalize_rental_import('{batch_id}'::uuid);\n"
    for name, content in [('01_inizializza.sql',init),('05_verifica_e_collega.sql',finalize)]:
        path=output/name
        path.write_text(content)
        path.chmod(0o600)
    summary={'batch_id':str(batch_id),'source_sha256':digest,'source_bytes':size,'bookings':len(bookings),
             'items':len(items),'original_rows':len(originals),'location':location,'grouping_columns':list(GROUP_COLUMNS)}
    path=output/'riepilogo-import.json'
    path.write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
    path.chmod(0o600)
    return summary


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=Path,required=True)
    parser.add_argument('--output-dir',type=Path,default=ROOT/'private/booking-imports/importazione')
    parser.add_argument('--location',default='Madesimo')
    args=parser.parse_args()
    print(json.dumps(generate(args.source,args.output_dir,args.location)))
