"""Misura il CSV reale in PostgreSQL locale effimero. Non accede a Supabase.

Le tabelle di prova copiano colonne e indici del gestionale; i vincoli incompatibili
con lo storico vengono rilassati SOLO nel database temporaneo. Non è un importer.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import csv
from datetime import datetime, timezone
from decimal import Decimal
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
from uuid import UUID, uuid5

import psycopg
from psycopg import sql
from psycopg.types.json import Jsonb

ROOT = Path(__file__).resolve().parents[2]
NAMESPACE = UUID('47acfbde-831e-4fce-afb9-294380863af5')
OPERATOR = UUID('10000000-0000-0000-0000-000000000001')
SITE = UUID('20000000-0000-0000-0000-000000000001')
GROUP_COLUMNS = ('codice', 'id_clienti', 'data_uscita', 'rientro_previsto')
PERSON_COLUMNS = ('cognome', 'nome', 'email', 'telefono', 'data_nascita', 'lingua', 'stato')


def load_source(path: Path):
    raw = path.read_bytes()
    with path.open(encoding='utf-8-sig', newline='') as stream:
        reader = csv.DictReader(stream)
        rows = list(reader)
    required = set(GROUP_COLUMNS + PERSON_COLUMNS) | {
        'barcode', 'marca', 'modello', 'value_it', 'data_rientro', 'totale_pagato',
    }
    if not required.issubset(reader.fieldnames or []) or any(None in row for row in rows):
        raise ValueError('Struttura CSV inattesa: nessun caricamento effettuato.')
    for row in rows:
        start = date_value(row['data_uscita'])
        end = date_value(row['rientro_previsto'])
        if not start or not end or end < start:
            raise ValueError('Periodo non valido: rivedere il CSV prima della prova.')
        amount = Decimal(row['totale_pagato'].replace('.', '').replace(',', '.'))
        if not amount.is_finite():
            raise ValueError('Importo non finito: rivedere il CSV prima della prova.')
    return rows, hashlib.sha256(raw).hexdigest(), len(raw)


def date_value(value: str):
    return datetime.strptime(value, '%d/%m/%Y').date() if value else None


def customer_module():
    spec = importlib.util.spec_from_file_location('customer_import', ROOT / 'scripts/customer_import/generate.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def bootstrap(conn):
    conn.execute('''
      create role anon; create role authenticated;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated,anon;
      create table operator_profiles(id uuid primary key references auth.users(id),created_at timestamptz default now(),name text);
      create table locations(id uuid primary key,name text);
      create table operator_locations(operator_id uuid references operator_profiles(id),location_id uuid references locations(id),primary key(operator_id,location_id));
    ''')
    conn.execute('insert into auth.users values(%s)', (OPERATOR,))
    conn.execute("insert into operator_profiles(id,name) values(%s,'Prova locale')", (OPERATOR,))
    conn.execute("insert into locations values(%s,'Madesimo')", (SITE,))
    conn.execute('insert into operator_locations values(%s,%s)', (OPERATOR, SITE))
    # 003/004 sono caricamenti di esempio/reali, non migrazioni dello schema.
    for migration in sorted((ROOT / 'backend/sql').glob('[0-9][0-9][0-9]_*.sql')):
        if migration.name.startswith(('003_', '004_')):
            continue
        conn.execute(migration.read_text(), prepare=False)
    conn.execute((ROOT / 'backend/sql/004_import_all_rental_items.sql').read_text(), prepare=False)


def trial_schema(conn):
    conn.execute('''
      create schema legacy_trial;
      create table legacy_trial.bookings (like public.rental_bookings including defaults including indexes including storage);
      alter table legacy_trial.bookings alter column customer_id drop not null;
      alter table legacy_trial.bookings add column source_code text, add column source_customer_id text;
      create table legacy_trial.items (like public.rental_booking_items including defaults including storage);
      alter table legacy_trial.items alter column rental_inventory_id drop not null;
      alter table legacy_trial.items add primary key(id);
      create index on legacy_trial.items(booking_id,rental_inventory_id);
      create index on legacy_trial.items(rental_inventory_id);
      create table legacy_trial.payments (like public.rental_payments including defaults including indexes including storage);
      alter table legacy_trial.payments alter column payment_method drop not null;
      alter table legacy_trial.payments alter column paid_at drop not null;
      create table legacy_trial.source_rows(source_row integer primary key,booking_id uuid not null,item_id uuid not null,raw_data jsonb not null);
      create index on legacy_trial.source_rows(booking_id);
    ''')


def copy_rows(conn, statement: str, rows):
    with conn.cursor().copy(statement) as copy:
        for row in rows:
            copy.write_row(row)


def measure(conn, source_rows, digest, customer_data):
    lookup = defaultdict(list)
    for record in customer_data['records']:
        lookup[tuple(record['raw_data'][key] for key in PERSON_COLUMNS)].append(record['customer_id'])
    candidates = defaultdict(set)
    for row in source_rows:
        matches = lookup[tuple(row[key] for key in PERSON_COLUMNS)]
        if len(matches) == 1:
            candidates[row['id_clienti']].add(matches[0])
    customer_links = {key: next(iter(values)) for key, values in candidates.items() if len(values) == 1}
    inventory = {code: identifier for identifier, code in conn.execute('select id,code from rental_inventory')}
    grouped = defaultdict(list)
    for number, row in enumerate(source_rows, 1):
        grouped[tuple(row[key] for key in GROUP_COLUMNS)].append((number, row))
    booking_rows, item_rows, payment_rows, archive_rows = [], [], [], []
    groups_per_customer = Counter()
    for booking_number, (key, entries) in enumerate(grouped.items(), 1):
        booking_id = uuid5(NAMESPACE, digest + json.dumps(key, ensure_ascii=False))
        first = entries[0][1]
        booking_rows.append((booking_id, booking_number, customer_links.get(first['id_clienti']), SITE,
                             date_value(first['data_uscita']), date_value(first['rientro_previsto']),
                             'completed' if all(row['data_rientro'] for _, row in entries) else 'active',
                             OPERATOR, first['codice'], first['id_clienti']))
        groups_per_customer[first['id_clienti']] += 1
        for number, row in entries:
            item_id = uuid5(NAMESPACE, f'{digest}:item:{number}')
            amount = Decimal(row['totale_pagato'].replace('.', '').replace(',', '.'))
            returned = datetime.combine(date_value(row['data_rientro']), datetime.min.time(), timezone.utc) if row['data_rientro'] else None
            item_rows.append((item_id, booking_id, inventory.get(row['barcode']), row['barcode'], row['marca'],
                              row['modello'], row['value_it'] or None, amount, returned))
            # Una registrazione per ogni importo non nullo: scenario prudente per gli indici.
            # Non sono note modalità/data effettiva di pagamento: rimangono NULL nella prova.
            if amount:
                payment_rows.append((uuid5(NAMESPACE, f'{digest}:payment:{number}'), booking_id, None, amount, None, OPERATOR))
            archive_rows.append((number, booking_id, item_id, Jsonb(row)))
    before = conn.execute('select pg_database_size(current_database())').fetchone()[0]
    trial_schema(conn)
    with conn.transaction():
        copy_rows(conn, 'copy legacy_trial.bookings(id,booking_number,customer_id,location_id,starts_on,ends_on,status,created_by,source_code,source_customer_id) from stdin', booking_rows)
        copy_rows(conn, 'copy legacy_trial.items(id,booking_id,rental_inventory_id,code_snapshot,brand_snapshot,model_snapshot,size_snapshot,amount,returned_at) from stdin', item_rows)
        copy_rows(conn, 'copy legacy_trial.payments(id,booking_id,payment_method,amount,paid_at,created_by) from stdin', payment_rows)
        copy_rows(conn, 'copy legacy_trial.source_rows(source_row,booking_id,item_id,raw_data) from stdin', archive_rows)
    conn.execute('analyze')
    sizes = {name: {'total_bytes': total, 'index_bytes': indexes, 'data_and_toast_bytes': total - indexes}
             for name, total, indexes in conn.execute('''
        select relname,pg_total_relation_size(c.oid),pg_indexes_size(c.oid)
        from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='legacy_trial' and c.relkind='r' order by relname
    ''')}
    counts = {name: conn.execute(f'select count(*) from legacy_trial.{name}').fetchone()[0]
              for name in ('bookings', 'items', 'payments', 'source_rows')}
    assert counts['items'] == counts['source_rows'] == len(source_rows)
    assert counts['bookings'] == len(grouped)
    # Controllo completo cella per cella, inclusi vuoti, doppioni e importi negativi.
    for (number, raw), expected in zip(conn.execute('select source_row,raw_data from legacy_trial.source_rows order by source_row'), source_rows, strict=True):
        assert raw == expected, f'Riga originale non conservata: {number}'
    stored = conn.execute('select source_customer_id,count(*) from legacy_trial.bookings group by source_customer_id').fetchall()
    assert {key: count for key, count in stored} == dict(groups_per_customer)
    return {
        'purpose': 'Local sizing trial only; not an operational import or production database measurement.',
        'counts': counts,
        'all_original_rows_verified': True,
        'all_bookings_per_customer_verified': True,
        'customers_with_multiple_bookings': sum(count > 1 for count in groups_per_customer.values()),
        'max_bookings_for_one_customer': max(groups_per_customer.values()),
        'grouping_columns': list(GROUP_COLUMNS),
        'sizes': sizes,
        'structured_total_bytes': sum(value['total_bytes'] for key, value in sizes.items() if key != 'source_rows'),
        'total_with_original_archive_bytes': sum(value['total_bytes'] for value in sizes.values()),
        'database_growth_bytes': conn.execute('select pg_database_size(current_database())').fetchone()[0] - before,
        'import_review': {
            'customer_ids_without_unique_match': len({row['id_clienti'] for row in source_rows} - set(customer_links)),
            'rows_without_unique_customer_match': sum(row['id_clienti'] not in customer_links for row in source_rows),
            'material_codes_missing_from_current_inventory': len({row['barcode'] for row in source_rows} - set(inventory)),
            'rows_missing_current_inventory': sum(row['barcode'] not in inventory for row in source_rows),
            'negative_amount_rows': sum(Decimal(row['totale_pagato'].replace('.', '').replace(',', '.')) < 0 for row in source_rows),
            'missing_return_date_rows': sum(not row['data_rientro'] for row in source_rows),
            'exact_duplicate_rows_preserved': len(source_rows) - len({tuple(row.values()) for row in source_rows}),
        },
        'trial_only_relaxations': [
            'Ambiguous customer links and unavailable historical inventory links left NULL; originals retained.',
            'Historical repeated items and signed reported amounts retained without operational constraints.',
            'Payment date/method unknown: NULL, with a conservative separate entry per nonzero source amount.',
            'CSV reported paid amount used for numeric-field sizing; not an inference of original tariff or balance.',
            'Calendar return dates represented as midnight UTC only to measure existing timestamp column sizes.',
        ],
    }


def validate_import(conn, directory: Path, source_rows):
    """Verifica i CSV effettivi nelle tabelle operative con lo schema 030."""
    import sys
    sys.path.insert(0, str(ROOT / 'backend'))
    from app.services.rental_history_service import enrich
    from app.schemas.rental_history import HistoryBookingDetails

    untouched = ('customers', 'rental_inventory', 'rental_payments')
    before_counts = {table: conn.execute(sql.SQL('select count(*) from public.{}').format(sql.Identifier(table))).fetchone()[0]
                     for table in untouched}
    before = conn.execute('select pg_database_size(current_database())').fetchone()[0]
    conn.execute((directory / '01_inizializza.sql').read_text(), prepare=False)
    for filename, table in (
        ('02_prenotazioni.csv', 'rental_bookings'),
        ('03_materiali_noleggiati.csv', 'rental_booking_items'),
        ('04_righe_originali.csv', 'rental_import_rows'),
    ):
        with (directory / filename).open(encoding='utf-8', newline='') as stream:
            columns = next(csv.reader(stream))
        statement = sql.SQL('copy public.{} ({}) from stdin with (format csv,header true)').format(
            sql.Identifier(table), sql.SQL(',').join(map(sql.Identifier, columns)))
        with conn.cursor().copy(statement) as copy, (directory / filename).open('rb') as stream:
            while block := stream.read(1024 * 1024):
                copy.write(block)
    conn.execute("select set_config('request.jwt.claim.sub',%s,false)", (str(OPERATOR),))
    conn.execute('set role authenticated')
    assert conn.execute('select count(*) from rental_bookings').fetchone()[0] == 0
    conn.execute('reset role')
    result = conn.execute((directory / '05_verifica_e_collega.sql').read_text()).fetchone()[0]
    assert result['items'] == result['original_rows'] == len(source_rows)
    for (_, raw), original in zip(conn.execute('select source_row,raw_data from rental_import_rows order by source_row'), source_rows, strict=True):
        assert raw == original
    expected_sum = sum((Decimal(row['totale_pagato'].replace('.', '').replace(',', '.')) for row in source_rows), Decimal(0))
    assert conn.execute('select sum(legacy_reported_paid_amount) from rental_booking_items').fetchone()[0] == expected_sum
    assert conn.execute('select sum(legacy_reported_paid_amount) from rental_bookings').fetchone()[0] == expected_sum
    for table, count in before_counts.items():
        assert conn.execute(sql.SQL('select count(*) from public.{}').format(sql.Identifier(table))).fetchone()[0] == count
    expected_groups = Counter(tuple(row[key] for key in GROUP_COLUMNS) for row in source_rows)
    grouped = conn.execute("select legacy_code,legacy_customer_id,to_char(starts_on,'DD/MM/YYYY'),to_char(ends_on,'DD/MM/YYYY') from rental_bookings").fetchall()
    assert set(grouped) == set(expected_groups)
    assert len(grouped) == len(expected_groups)
    headers = []
    for header, customer in conn.execute('select to_jsonb(b),to_jsonb(c) from rental_bookings b left join customers c on c.id=b.customer_id'):
        header['customer'] = customer
        header['hotel'] = None
        headers.append(header)
    items = [row[0] for row in conn.execute('select to_jsonb(i) from rental_booking_items i')]
    views = enrich(headers, items, [], details=True)
    for row in views:
        model = HistoryBookingDetails.model_validate(row)
        assert model.total == model.paid_amount and model.balance == 0
        assert model.status == 'completed' and model.is_legacy
    assert sum(len(row['items']) for row in views) == len(source_rows)
    assert conn.execute((directory / '05_verifica_e_collega.sql').read_text()).fetchone()[0] == result
    conn.execute('set role authenticated')
    assert conn.execute('select count(*) from rental_bookings').fetchone()[0] == result['bookings']
    try:
        with conn.transaction():
            conn.execute('select * from rental_import_rows limit 1')
    except psycopg.errors.InsufficientPrivilege:
        pass
    else:
        raise AssertionError('Le righe originali devono restare amministrative.')
    conn.execute('reset role')
    conn.execute('analyze')
    sizes = {name: {'total_bytes': total, 'index_bytes': indexes} for name, total, indexes in conn.execute("""
      select relname,pg_total_relation_size(c.oid),pg_indexes_size(c.oid)
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind='r' and relname in ('rental_bookings','rental_booking_items','rental_import_batches','rental_import_rows') order by relname
    """)}
    return {'counts': result, 'all_cells_verified': True, 'all_bookings_per_customer_verified': True,
            'all_api_responses_verified_paid_in_full': True, 'no_new_customers_inventory_or_payments': True,
            'finalization_idempotent': True, 'raw_rows_admin_only': True, 'sizes': sizes,
            'total_bytes': sum(value['total_bytes'] for value in sizes.values()),
            'database_growth_bytes': conn.execute('select pg_database_size(current_database())').fetchone()[0] - before}


def run(args):
    rows, digest, file_size = load_source(args.source)
    customers = customer_module()
    customer_data = customers.load_csv(args.customers)
    initdb, pg_ctl = shutil.which('initdb'), shutil.which('pg_ctl')
    if not initdb or not pg_ctl:
        raise RuntimeError('Servono i binari PostgreSQL locali initdb e pg_ctl.')
    with tempfile.TemporaryDirectory(prefix='skirenting-legacy-sizing-', dir='/private/tmp') as directory:
        data = str(Path(directory) / 'data')
        subprocess.run([initdb, '-D', data, '-A', 'trust', '--no-locale', '-E', 'UTF8'], check=True, capture_output=True)
        started = False
        try:
            subprocess.run([pg_ctl, '-D', data, '-l', str(Path(directory) / 'postgres.log'),
                            '-o', f"-k {directory} -p 55459 -h ''", 'start'], check=True, capture_output=True)
            started = True
            with psycopg.connect(dbname='postgres', host=directory, port=55459, autocommit=True) as conn:
                bootstrap(conn)
                conn.execute(customers.render_sql(customer_data), prepare=False)
                report = measure(conn, rows, digest, customer_data)
                if args.import_dir:
                    report['final_import_validation'] = validate_import(conn, args.import_dir, rows)
                    report['initial_projection_only'] = {key: report[key] for key in ('counts','sizes','structured_total_bytes','total_with_original_archive_bytes','database_growth_bytes','trial_only_relaxations')}
                    actual = report['final_import_validation']
                    report.update(counts={**actual['counts'],'new_payment_transactions':0}, sizes=actual['sizes'],
                                  total_with_original_archive_bytes=actual['total_bytes'],database_growth_bytes=actual['database_growth_bytes'])
                    report.pop('trial_only_relaxations')
                    report['structured_total_bytes']=actual['total_bytes']-actual['sizes']['rental_import_rows']['total_bytes']
        finally:
            if started:
                subprocess.run([pg_ctl, '-D', data, 'stop', '-m', 'fast'], check=True, capture_output=True)
    report.update(source_filename=args.source.name, source_sha256=digest, source_bytes=file_size)
    args.output.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    args.output.chmod(0o600)
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--customers', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=ROOT / 'private/booking-imports/prova-locale.json')
    parser.add_argument('--import-dir', type=Path)
    run(parser.parse_args())
