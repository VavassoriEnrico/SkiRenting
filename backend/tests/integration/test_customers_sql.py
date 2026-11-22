"""Verifica 006 su un database effimero, senza accedere a Supabase."""
import os
from pathlib import Path
from uuid import uuid4

import psycopg
import pytest
from psycopg import sql

pytestmark = pytest.mark.skipif(
    not os.environ.get('SKIRENTING_TEST_PG_HOST'), reason='PostgreSQL temporaneo non configurato',
)
USER_A = '10000000-0000-0000-0000-000000000001'
USER_B = '10000000-0000-0000-0000-000000000002'
UNCONFIGURED_USER = '10000000-0000-0000-0000-000000000003'


@pytest.fixture(scope='module')
def customer_database():
    host = os.environ['SKIRENTING_TEST_PG_HOST']
    assert host.startswith('/private/tmp/'), 'Usare un socket PostgreSQL temporaneo.'
    kwargs = {'host': host, 'port': os.environ.get('SKIRENTING_TEST_PG_PORT', '55439')}
    name = f'skirenting_customers_test_{uuid4().hex}'
    with psycopg.connect(dbname='postgres', autocommit=True, **kwargs) as admin:
        admin.execute(sql.SQL('create database {}').format(sql.Identifier(name)))
        try:
            with psycopg.connect(dbname=name, autocommit=True, **kwargs) as conn:
                conn.execute('''
                    create schema auth;
                    create function auth.uid() returns uuid language sql stable as $$
                      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
                    $$;
                    grant usage on schema auth to authenticated, anon;
                    create table operator_profiles(id uuid primary key, name text);
                    create table locations(id uuid primary key, name text);
                    create table operator_locations(
                      operator_id uuid references operator_profiles(id),
                      location_id uuid references locations(id),
                      primary key(operator_id,location_id)
                    );
                ''')
                for user, label in [(USER_A, 'Banco A'), (USER_B, 'Banco B')]:
                    conn.execute('insert into operator_profiles values(%s,%s)', (user, label))
                    conn.execute('insert into locations values(%s,%s)', (user, label))
                    conn.execute('insert into operator_locations values(%s,%s)', (user, user))
                folder = Path(__file__).resolve().parents[2] / 'sql'
                for file in ['001_operator_read_policies.sql', '006_customers.sql',
                             '015_customer_profile_fields.sql', '015_customer_profile_fields.sql',
                             '016_legacy_customer_import.sql', '016_legacy_customer_import.sql']:
                    conn.execute((folder / file).read_text(), prepare=False)
                yield conn
        finally:
            admin.execute(sql.SQL('drop database {}').format(sql.Identifier(name)))


@pytest.fixture
def db(customer_database):
    with customer_database.transaction(force_rollback=True):
        customer_database.execute('set local role authenticated')
        customer_database.execute("select set_config('request.jwt.claim.sub',%s,true)", (USER_A,))
        yield customer_database


def test_customer_shared_between_operators_in_different_sites(db):
    customer_id = db.execute('''
        insert into customers(first_name,last_name,phone,email,document_path)
        values('Mario','Rossi','+39 001234','famiglia@example.test','customers/document.jpg')
        returning id
    ''').fetchone()[0]
    db.execute("select set_config('request.jwt.claim.sub',%s,true)", (USER_B,))
    assert db.execute('select phone from customers where id=%s', (customer_id,)).fetchone()[0] == '+39 001234'
    db.execute("update customers set notes='Contattato dalla seconda sede' where id=%s", (customer_id,))
    assert db.execute('select notes from customers where id=%s', (customer_id,)).fetchone()[0] == 'Contattato dalla seconda sede'
    # Recapiti condivisi non impediscono di registrare un altro familiare.
    db.execute('''insert into customers(first_name,last_name,phone,email)
                  values('Anna','Rossi','+39 001234','famiglia@example.test')''')


def test_update_timestamp_and_optional_contact_data(db):
    customer_id, previous = db.execute('''
        insert into customers(first_name,last_name,updated_at)
        values('Mario','Rossi','2000-01-01') returning id,updated_at
    ''').fetchone()
    current = db.execute("update customers set notes='Nota' where id=%s returning updated_at", (customer_id,)).fetchone()[0]
    assert current > previous


@pytest.mark.parametrize('first,last', [('', 'Rossi'), ('Mario', '  '), (None, 'Rossi')])
def test_names_are_required(db, first, last):
    with pytest.raises((psycopg.errors.CheckViolation, psycopg.errors.NotNullViolation)), db.transaction():
        db.execute('insert into customers(first_name,last_name) values(%s,%s)', (first, last))


def test_unconfigured_account_cannot_read_or_create_customers(db):
    db.execute("insert into customers(first_name,last_name) values('Mario','Rossi')")
    db.execute("select set_config('request.jwt.claim.sub',%s,true)", (UNCONFIGURED_USER,))
    assert db.execute('select count(*) from customers').fetchone()[0] == 0
    with pytest.raises(psycopg.errors.InsufficientPrivilege), db.transaction():
        db.execute("insert into customers(first_name,last_name) values('Mario','Rossi')")


def test_operator_with_revoked_site_cannot_access_customers(customer_database):
    with customer_database.transaction(force_rollback=True):
        customer_database.execute("insert into customers(first_name,last_name) values('Mario','Rossi')")
        customer_database.execute('delete from operator_locations where operator_id=%s', (USER_A,))
        customer_database.execute('set local role authenticated')
        customer_database.execute("select set_config('request.jwt.claim.sub',%s,true)", (USER_A,))
        assert customer_database.execute('select count(*) from customers').fetchone()[0] == 0


def test_anonymous_access_and_operator_deletion_are_denied(db):
    with pytest.raises(psycopg.errors.InsufficientPrivilege), db.transaction():
        db.execute('set local role anon')
        db.execute('select * from customers')
    with pytest.raises(psycopg.errors.InsufficientPrivilege), db.transaction():
        db.execute('delete from customers')


def test_customer_extra_fields_and_shared_read_access(db):
    customer_id = db.execute("""insert into customers(first_name,last_name,birth_date,skill_level,language,country_code)
        values('Mario','Rossi','1990-04-15','intermediate','IT','CH') returning id""").fetchone()[0]
    db.execute("select set_config('request.jwt.claim.sub',%s,true)", (USER_B,))
    row = db.execute('select birth_date::text,skill_level,language,country_code from customers where id=%s', (customer_id,)).fetchone()
    assert row == ('1990-04-15','intermediate','IT','CH')


@pytest.mark.parametrize('field,value', [
    ('birth_date','9999-01-01'), ('birth_date','infinity'), ('skill_level','advanced'),
    ('language','it'), ('language','ITALIANO'), ('country_code','I1'),
])
def test_customer_extra_fields_have_database_constraints(db, field, value):
    with pytest.raises(psycopg.errors.CheckViolation), db.transaction():
        db.execute(sql.SQL("insert into customers(first_name,last_name,{}) values('Mario','Rossi',%s)")
                   .format(sql.Identifier(field)), (value,))


def test_legacy_marker_cannot_be_written_by_operators(db):
    with pytest.raises(psycopg.errors.InsufficientPrivilege), db.transaction():
        db.execute("insert into customers(first_name,last_name,is_legacy) values('','',true)")
    with pytest.raises(psycopg.errors.InsufficientPrivilege), db.transaction():
        db.execute('update customers set is_legacy=true')
    for table in ['customer_import_batches', 'customer_import_rows']:
        with pytest.raises(psycopg.errors.InsufficientPrivilege), db.transaction():
            db.execute(sql.SQL('select * from {}').format(sql.Identifier(table)))


@pytest.mark.parametrize('mode', ['single', 'blocks'])
def test_full_legacy_sql_import_preserves_all_rows_and_is_repeatable(customer_database, tmp_path, mode):
    import importlib.util
    script_path = Path(__file__).resolve().parents[3] / 'scripts/customer_import/generate.py'
    spec = importlib.util.spec_from_file_location('customer_import_sql_generator', script_path)
    generator = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(generator)
    import csv
    source = tmp_path / "clienti'_test.csv"
    headers = ['cognome','nome','email','telefono','data_nascita','eta','r_capacita',
               'rentall_privacy','lingua','stato','tot_articoli_noleggiati','pagato','visite','stagionale','']
    names = [("O'Brian $$'; select 1; --",'Rossi'), ('',''), ('123','456'), ('Same','Person'), ('Same','Person')]
    with source.open('w', encoding='utf-8-sig', newline='') as file:
        writer = csv.writer(file)
        writer.writerow(headers)
        for first,last in names:
            writer.writerow([last,first,'','0000123','15/04/1990','36','INTERMEDIO','N','IT','CH','3','-1.250,00','2','S',''])
    data = generator.load_csv(source)
    conn = customer_database
    ids = [r['customer_id'] for r in data['records']]
    try:
        files = [generator.render_sql(data)] if mode == 'single' else list(generator.render_blocks(data, 2).values())
        conn.execute(files[0], prepare=False)
        if mode == 'blocks':
            with pytest.raises(psycopg.errors.RaiseException, match='Importazione incompleta'):
                conn.execute(files[-1], prepare=False)
            conn.execute('rollback')
            assert conn.execute('select count(*) from customer_import_rows where batch_id=%s', (data['batch_id'],)).fetchone()[0] == 2
            for block in files[1:]:
                conn.execute(block, prepare=False)
        assert conn.execute('select count(*) from customer_import_rows where batch_id=%s', (data['batch_id'],)).fetchone()[0] == 5
        assert conn.execute("select count(*) from customers where first_name='Same' and last_name='Person'").fetchone()[0] == 2
        for record, (first,last) in zip(data['records'], names, strict=True):
            row = conn.execute('select first_name,last_name,phone,birth_date::text,skill_level,is_legacy from customers where id=%s', (record['customer_id'],)).fetchone()
            assert row == (first,last,'0000123','1990-04-15','intermediate',True)
            raw = conn.execute('select raw_data from customer_import_rows where customer_id=%s', (record['customer_id'],)).fetchone()[0]
            assert raw['pagato'] == '-1.250,00' and raw['rentall_privacy'] == 'N' and raw['stagionale'] == 'S'
        with conn.transaction():
            conn.execute('set local role authenticated')
            conn.execute("select set_config('request.jwt.claim.sub',%s,true)", (USER_A,))
            assert conn.execute('select count(*) from customers where id=any(%s::uuid[])', (ids,)).fetchone()[0] == 5
            conn.execute("update customers set first_name='Corretto' where id=%s", (ids[0],))
        for block in files:
            conn.execute(block, prepare=False)
        assert conn.execute('select count(*) from customers where id=any(%s::uuid[])', (ids,)).fetchone()[0] == 5
        assert conn.execute('select first_name from customers where id=%s', (ids[0],)).fetchone()[0] == 'Corretto'
    finally:
        if conn.info.transaction_status != psycopg.pq.TransactionStatus.IDLE:
            conn.execute('rollback')
        conn.execute('delete from customer_import_rows where batch_id=%s', (data['batch_id'],))
        conn.execute('delete from customer_import_batches where id=%s', (data['batch_id'],))
        conn.execute('delete from customers where id=any(%s::uuid[])', (ids,))


@pytest.mark.skipif(not os.environ.get('SKIRENTING_CUSTOMER_IMPORT_SQL'), reason='File privato di importazione non indicato')
def test_prepared_private_import_on_temporary_database(customer_database):
    """Controllo facoltativo del file reale, solo nel database effimero del fixture."""
    import json
    path = Path(os.environ['SKIRENTING_CUSTOMER_IMPORT_SQL'])
    report = json.loads(path.with_name('riepilogo.json').read_text())
    conn = customer_database
    batch_id = report['batch_id']
    ids = []
    try:
        blocks = sorted(path.with_name('blocchi').glob('[0-9][0-9]_clienti.sql'))
        for block in blocks or [path]:
            conn.execute(block.read_text(), prepare=False)
        ids = [row[0] for row in conn.execute('select customer_id from customer_import_rows where batch_id=%s', (batch_id,)).fetchall()]
        assert len(ids) == report['summary']['rows']
        assert conn.execute('select count(*) from customers where id=any(%s::uuid[])', (ids,)).fetchone()[0] == len(ids)
        conn.execute(path.read_text(), prepare=False)
        assert conn.execute('select count(*) from customer_import_rows where batch_id=%s', (batch_id,)).fetchone()[0] == len(ids)
        assert conn.execute('select count(*) from customers where id=any(%s::uuid[])', (ids,)).fetchone()[0] == len(ids)
    finally:
        if conn.info.transaction_status != psycopg.pq.TransactionStatus.IDLE:
            conn.execute('rollback')
        conn.execute('delete from customer_import_rows where batch_id=%s', (batch_id,))
        conn.execute('delete from customer_import_batches where id=%s', (batch_id,))
        if ids:
            conn.execute('delete from customers where id=any(%s::uuid[])', (ids,))
