"""Verifica della query 007 su PostgreSQL temporaneo, senza accesso a Supabase."""
import os
from datetime import datetime, timezone
from decimal import Decimal
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
UNASSIGNED = '10000000-0000-0000-0000-000000000003'


@pytest.fixture(scope='module')
def booking_database():
    host = os.environ['SKIRENTING_TEST_PG_HOST']
    assert host.startswith('/private/tmp/'), 'Usare un socket PostgreSQL temporaneo.'
    kwargs = {'host': host, 'port': os.environ.get('SKIRENTING_TEST_PG_PORT', '55439')}
    name = f'skirenting_bookings_test_{uuid4().hex}'
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
                    -- Solo i riferimenti necessari a 007, senza duplicare lo schema del catalogo.
                    create table rental_inventory(id uuid primary key, code text);
                ''')
                for user in [USER_A, USER_B, UNASSIGNED]:
                    conn.execute('insert into operator_profiles values(%s,%s)', (user, 'Banco'))
                for user in [USER_A, USER_B]:
                    conn.execute('insert into locations values(%s,%s)', (user, 'Sede'))
                    conn.execute('insert into operator_locations values(%s,%s)', (user, user))
                    conn.execute('insert into rental_inventory values(%s,%s)', (user, f'+00{user[-1]}'))
                folder = Path(__file__).resolve().parents[2] / 'sql'
                for file in ['001_operator_read_policies.sql', '006_customers.sql',
                             '007_rental_bookings_and_payments.sql']:
                    conn.execute((folder / file).read_text(), prepare=False)
                conn.execute('''insert into customers(id,first_name,last_name)
                                values(%s,'Mario','Rossi')''', (USER_A,))
                for user in [USER_A, USER_B]:
                    conn.execute('''insert into rental_bookings
                        (id,customer_id,location_id,starts_on,ends_on,created_by,discount_percent)
                        values(%s,%s,%s,'2026-12-01','2026-12-03',%s,10)''',
                                 (user, USER_A, user, user))
                    conn.execute('''insert into rental_booking_items
                        (booking_id,rental_inventory_id,code_snapshot,brand_snapshot,
                         model_snapshot,size_snapshot,daily_price,amount)
                        values(%s,%s,%s,'Marca','Modello','164 cm',20,60)''',
                                 (user, user, f'+00{user[-1]}'))
                yield conn
        finally:
            admin.execute(sql.SQL('drop database {}').format(sql.Identifier(name)))


@pytest.fixture
def db(booking_database):
    with booking_database.transaction(force_rollback=True):
        yield booking_database


def test_payments_have_actual_timestamp_and_allow_deposit_and_balance(db):
    first = db.execute('''insert into rental_payments
        (booking_id,payment_method,amount,paid_at,created_by)
        values(%s,'Contanti',25,'2026-11-01 10:30:45+01',%s)
        returning paid_at,created_at''', (USER_A, USER_A)).fetchone()
    assert first[0] == datetime(2026, 11, 1, 9, 30, 45, tzinfo=timezone.utc)
    assert first[0] != first[1]
    db.execute('''insert into rental_payments(booking_id,payment_method,amount,created_by)
                  values(%s,'Carta',29,%s)''', (USER_A, USER_A))
    total = db.execute('''select round(sum(i.amount)*(1-b.discount_percent/100),2)
        from rental_booking_items i join rental_bookings b on b.id=i.booking_id
        where b.id=%s group by b.id''', (USER_A,)).fetchone()[0]
    paid = db.execute('select sum(amount) from rental_payments where booking_id=%s',
                      (USER_A,)).fetchone()[0]
    assert total == paid == Decimal('54.00')


def test_pay_later_needs_no_zero_payment(db):
    assert db.execute('select count(*) from rental_payments where booking_id=%s',
                      (USER_A,)).fetchone()[0] == 0


@pytest.mark.parametrize('amount', ['0', '-1', 'NaN'])
def test_invalid_payment_amount_is_rejected(db, amount):
    with pytest.raises(psycopg.errors.CheckViolation), db.transaction():
        db.execute('''insert into rental_payments(booking_id,payment_method,amount,created_by)
                      values(%s,'Contanti',%s,%s)''', (USER_A, amount, USER_A))


def test_invalid_period_discount_status_and_empty_method_are_rejected(db):
    for column, value in [('ends_on', '2026-11-01'), ('discount_percent', '101'),
                          ('status', 'unknown')]:
        with pytest.raises(psycopg.errors.CheckViolation), db.transaction():
            db.execute(sql.SQL('update rental_bookings set {}=%s where id=%s').format(
                sql.Identifier(column)), (value, USER_A))
    with pytest.raises(psycopg.errors.CheckViolation), db.transaction():
        db.execute('''insert into rental_payments(booking_id,payment_method,amount,created_by)
                      values(%s,' ',10,%s)''', (USER_A, USER_A))


def test_duplicate_equipment_and_invalid_partial_return_are_rejected(db):
    with pytest.raises(psycopg.errors.UniqueViolation), db.transaction():
        db.execute('''insert into rental_booking_items
            (booking_id,rental_inventory_id,code_snapshot,brand_snapshot,model_snapshot,amount)
            values(%s,%s,'+001','Marca','Modello',60)''', (USER_A, USER_A))
    with pytest.raises(psycopg.errors.CheckViolation), db.transaction():
        db.execute("update rental_booking_items set returned_at=now() where booking_id=%s", (USER_A,))
    db.execute('''update rental_booking_items set delivered_at='2026-12-01 09:00+01',
                  returned_at='2026-12-03 17:00+01' where booking_id=%s''', (USER_A,))


def test_history_snapshots_and_prices_survive_inventory_changes(db):
    db.execute("update rental_inventory set code='NEW-CODE' where id=%s", (USER_A,))
    snapshot = db.execute('''select code_snapshot,daily_price,amount from rental_booking_items
                             where booking_id=%s''', (USER_A,)).fetchone()
    assert snapshot == ('+001', Decimal('20.00'), Decimal('60.00'))
    with pytest.raises(psycopg.errors.ForeignKeyViolation), db.transaction():
        db.execute('delete from rental_inventory where id=%s', (USER_A,))


def test_read_access_is_limited_to_assigned_site_for_bookings_items_and_payments(db):
    for user in [USER_A, USER_B]:
        db.execute('''insert into rental_payments(booking_id,payment_method,amount,created_by)
                      values(%s,'Contanti',10,%s)''', (user, user))
    db.execute('set local role authenticated')
    db.execute("select set_config('request.jwt.claim.sub',%s,true)", (USER_A,))
    assert db.execute('select id::text from rental_bookings').fetchall() == [(USER_A,)]
    for table in ['rental_booking_items', 'rental_payments']:
        assert db.execute(sql.SQL('select booking_id::text from {}').format(
            sql.Identifier(table))).fetchall() == [(USER_A,)]
    assert db.execute('select count(*) from hotels').fetchone()[0] == 2
    db.execute("select set_config('request.jwt.claim.sub',%s,true)", (UNASSIGNED,))
    for table in ['hotels', 'rental_bookings', 'rental_booking_items', 'rental_payments']:
        assert db.execute(sql.SQL('select count(*) from {}').format(
            sql.Identifier(table))).fetchone()[0] == 0


def test_anonymous_access_and_direct_writes_are_denied(db):
    db.execute('set local role authenticated')
    db.execute("select set_config('request.jwt.claim.sub',%s,true)", (USER_A,))
    with pytest.raises(psycopg.errors.InsufficientPrivilege), db.transaction():
        db.execute("update rental_bookings set notes='Nota' where id=%s", (USER_A,))
    with pytest.raises(psycopg.errors.InsufficientPrivilege), db.transaction():
        db.execute('delete from rental_payments')
    with pytest.raises(psycopg.errors.InsufficientPrivilege), db.transaction():
        db.execute('set local role anon')
        db.execute('select * from rental_bookings')
