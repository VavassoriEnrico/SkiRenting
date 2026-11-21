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
                for file in ['001_operator_read_policies.sql', '006_customers.sql']:
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
