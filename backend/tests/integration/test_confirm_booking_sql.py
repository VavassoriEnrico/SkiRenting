"""Conferma atomica su PostgreSQL temporaneo: il progetto Supabase non viene usato."""
import os
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from pathlib import Path
from threading import Barrier
from uuid import uuid4

import psycopg
import pytest
from psycopg import sql
from psycopg.types.json import Jsonb

pytestmark = pytest.mark.skipif(not os.environ.get('SKIRENTING_TEST_PG_HOST'), reason='PostgreSQL temporaneo non configurato')
USER_A = '10000000-0000-0000-0000-000000000001'
USER_B = '10000000-0000-0000-0000-000000000002'
SITE_A = '20000000-0000-0000-0000-000000000001'
SITE_B = '20000000-0000-0000-0000-000000000002'


@pytest.fixture(scope='module')
def confirmation_database():
    host = os.environ['SKIRENTING_TEST_PG_HOST']
    assert host.startswith('/private/tmp/')
    kwargs = {'host': host, 'port': os.environ.get('SKIRENTING_TEST_PG_PORT', '55439')}
    name = f'skirenting_confirmation_{uuid4().hex}'
    with psycopg.connect(dbname='postgres', autocommit=True, **kwargs) as admin:
        admin.execute(sql.SQL('create database {}').format(sql.Identifier(name)))
        try:
            with psycopg.connect(dbname=name, autocommit=True, **kwargs) as conn:
                conn.execute('''
                  create schema auth; create table auth.users(id uuid primary key);
                  create function auth.uid() returns uuid language sql stable as $$
                    select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
                  $$;
                  grant usage on schema auth to authenticated, anon;
                  create table operator_profiles(id uuid primary key references auth.users(id),
                    created_at timestamptz default now(),name text);
                  create table locations(id uuid primary key,name text);
                  create table operator_locations(operator_id uuid references operator_profiles(id),
                    location_id uuid references locations(id),primary key(operator_id,location_id));
                ''')
                for user in [USER_A, USER_B]:
                    conn.execute('insert into auth.users values(%s)', (user,))
                    conn.execute("insert into operator_profiles(id,name) values(%s,'Banco')", (user,))
                conn.execute("insert into locations values(%s,'Madesimo'),(%s,'Sede 2')", (SITE_A, SITE_B))
                conn.execute('insert into operator_locations values(%s,%s),(%s,%s),(%s,%s)',
                             (USER_A, SITE_A, USER_A, SITE_B, USER_B, SITE_A))
                folder = Path(__file__).resolve().parents[2] / 'sql'
                for file in ['001_operator_read_policies.sql', '002_material_catalog_and_inventory.sql',
                             '005_create_rental_item.sql', '006_customers.sql',
                             '007_rental_bookings_and_payments.sql', '008_hotels_management.sql',
                             '009_hotels_discount.sql', '010_rental_rates.sql',
                             '011_rental_inventory_transfers.sql', '012_confirm_rental_booking.sql',
                             '013_register_rental_return.sql', '014_register_rental_payment.sql', '015_customer_profile_fields.sql', '016_legacy_customer_import.sql',
                             '017_customer_management.sql', '017_customer_management.sql']:
                    conn.execute((folder / file).read_text(), prepare=False)
                conn.execute("insert into customers(id,first_name,last_name) values(%s,'Mario','Rossi')", (USER_A,))
                group = str(conn.execute("select id from material_groups where name='ALLMOUNTAIN'").fetchone()[0])
                category = str(conn.execute("select id from material_categories where code='ski'").fetchone()[0])
                conn.execute('''update rental_rates set daily_price_1_day=20,daily_price_2_days=18,
                    daily_price_3_days=16,daily_price_4_days=15,daily_price_5_days=14,
                    daily_price_6_days=12,daily_price_7_plus_days=10 where group_id=%s''', (group,))
                conn.execute("update hotels set discount=15 where name='Albergo 1'")
                hotel = str(conn.execute("select id from hotels where name='Albergo 1'").fetchone()[0])
                conn.execute("select set_config('request.jwt.claim.sub',%s,false)", (USER_A,))
                conn.execute('set role authenticated')
                ids = []
                for code in ['+001', '0002']:
                    body = {'category_id': category, 'group_id': group, 'code': code,
                            'new_variant': {'brand': 'Marca', 'model': 'Modello', 'details': {'length_cm': 164}}}
                    ids.append(conn.execute('select skirenting_create_rental_item(%s,%s)',
                               (SITE_A, Jsonb(body))).fetchone()[0]['id'])
                conn.execute('reset role')
                yield conn, {'dbname': name, **kwargs}, ids, hotel, group
        finally:
            admin.execute(sql.SQL('drop database {}').format(sql.Identifier(name)))


@pytest.fixture
def setup(confirmation_database):
    conn, kwargs, ids, hotel, group = confirmation_database
    with conn.transaction(force_rollback=True):
        conn.execute('set local role authenticated')
        conn.execute("select set_config('request.jwt.claim.sub',%s,true)", (USER_A,))
        yield conn, ids, hotel, group


def payload(ids, **changes):
    return {'customer_id': USER_A, 'starts_on': '2026-12-01', 'ends_on': '2026-12-03',
            'inventory_ids': [ids[0]], 'hotel_id': None, 'expected_total': '48.00', 'payment': None, **changes}


def confirm(conn, data, booking_id=None, site=SITE_A):
    return conn.execute('select skirenting_confirm_rental_booking(%s,%s,%s)',
                        (site, booking_id or str(uuid4()), Jsonb(data))).fetchone()[0]


def test_deposit_snapshots_and_idempotent_retry(setup):
    conn, ids, hotel, _ = setup
    data = payload(ids, hotel_id=hotel, expected_total='40.80', notes='Ritiro alle 9', payment={
        'amount': '20', 'payment_method': 'Carta', 'paid_at': '2026-11-21T13:30:00+00:00', 'notes': 'Acconto'})
    booking_id = str(uuid4())
    first = confirm(conn, data, booking_id)
    second = confirm(conn, data, booking_id)
    assert first == second
    assert Decimal(str(first['total'])) == Decimal('40.80')
    assert Decimal(str(first['balance'])) == Decimal('20.80')
    assert conn.execute('select count(*) from rental_payments where booking_id=%s', (booking_id,)).fetchone()[0] == 1
    assert conn.execute('select code_snapshot from rental_booking_items where booking_id=%s', (booking_id,)).fetchone()[0] == '+001'
    assert conn.execute('select notes from rental_bookings where id=%s', (booking_id,)).fetchone()[0] == 'Ritiro alle 9'
    assert first['notes'] == 'Ritiro alle 9'
    with pytest.raises(psycopg.errors.RaiseException), conn.transaction():
        confirm(conn, {**data, 'expected_total': '39'}, booking_id)


def test_pay_later_and_full_payment(setup):
    conn, ids, _, _ = setup
    later = confirm(conn, payload(ids))
    assert later['paid_amount'] == 0 and later['balance'] == 48
    full = confirm(conn, payload(ids, inventory_ids=[ids[1]], payment={
        'amount': '48', 'payment_method': 'Contanti', 'paid_at': '2026-11-21T14:00:00+01:00'}))
    assert full['balance'] == 0


@pytest.mark.parametrize('problem', ['price', 'payment', 'duplicate', 'customer'])
def test_failures_leave_no_partial_records(setup, problem):
    conn, ids, _, _ = setup
    data = payload(ids)
    if problem == 'price': data['expected_total'] = '1'
    if problem == 'payment': data['payment'] = {'amount': '99', 'payment_method': 'Carta', 'paid_at': '2026-11-21T10:00:00Z'}
    if problem == 'duplicate': data['inventory_ids'] = [ids[0], ids[0]]
    if problem == 'customer': data['customer_id'] = str(uuid4())
    with pytest.raises(psycopg.Error), conn.transaction(): confirm(conn, data)
    assert conn.execute('select count(*) from rental_bookings').fetchone()[0] == 0
    assert conn.execute('select count(*) from rental_booking_items').fetchone()[0] == 0
    assert conn.execute('select count(*) from rental_payments').fetchone()[0] == 0


def test_overlaps_block_but_non_overlapping_dates_are_allowed(setup):
    conn, ids, _, _ = setup
    confirm(conn, payload(ids))
    with pytest.raises(psycopg.errors.RaiseException), conn.transaction():
        confirm(conn, payload(ids, starts_on='2026-12-03', ends_on='2026-12-05'))
    assert confirm(conn, payload(ids, starts_on='2026-12-04', ends_on='2026-12-06'))['total'] == 48


def test_transfer_and_booking_cannot_ignore_each_other(setup):
    conn, ids, _, _ = setup
    confirm(conn, payload(ids))
    with pytest.raises(psycopg.Error), conn.transaction():
        conn.execute('select skirenting_transfer_rental_item(%s,%s,%s)', (ids[0], SITE_A, SITE_B))
    conn.execute('select skirenting_transfer_rental_item(%s,%s,%s)', (ids[1], SITE_A, SITE_B))
    with pytest.raises(psycopg.errors.RaiseException), conn.transaction():
        confirm(conn, payload(ids, inventory_ids=[ids[1]]))


def test_missing_rate_and_unauthorized_site_are_rejected(setup):
    conn, ids, _, group = setup
    conn.execute('update rental_rates set daily_price_3_days=null where group_id=%s', (group,))
    with pytest.raises(psycopg.errors.RaiseException), conn.transaction(): confirm(conn, payload(ids))
    conn.execute("select set_config('request.jwt.claim.sub',%s,true)", (USER_B,))
    with pytest.raises(psycopg.errors.InsufficientPrivilege), conn.transaction():
        confirm(conn, payload(ids), site=SITE_B)


def test_new_groups_get_rate_rows_automatically(setup):
    conn, _, _, _ = setup
    conn.execute('reset role')
    category = conn.execute("select id from material_categories where code='ski'").fetchone()[0]
    group = conn.execute("insert into material_groups(category_id,name) values(%s,'TEST NEW') returning id", (category,)).fetchone()[0]
    assert conn.execute('select daily_price_1_day from rental_rates where group_id=%s', (group,)).fetchone() == (None,)


def test_two_concurrent_confirmations_cannot_book_the_same_item(confirmation_database):
    owner, kwargs, ids, _, _ = confirmation_database
    barrier = Barrier(2)
    booking_ids = [str(uuid4()), str(uuid4())]

    def run(index):
        try:
            with psycopg.connect(**kwargs) as conn:
                conn.execute('set local role authenticated')
                conn.execute("select set_config('request.jwt.claim.sub',%s,true)", ([USER_A, USER_B][index],))
                barrier.wait(timeout=10)
                return confirm(conn, payload(ids, starts_on='2028-01-01', ends_on='2028-01-03'), booking_ids[index])
        except psycopg.errors.RaiseException:
            return None
    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(run, [0, 1]))
        assert sum(result is not None for result in results) == 1
    finally:
        owner.execute('delete from rental_booking_items where booking_id=any(%s::uuid[])', (booking_ids,))
        owner.execute('delete from rental_bookings where id=any(%s::uuid[])', (booking_ids,))


def register_return(conn, code='+001', request_id=None, site=SITE_A):
    return conn.execute('select skirenting_register_rental_return(%s,%s,%s)',
                        (site, request_id or str(uuid4()), code)).fetchone()[0]


@pytest.mark.parametrize('paid', [False, True])
def test_return_partial_complete_and_idempotence(setup, paid):
    conn, ids, _, _ = setup
    today = str(conn.execute("select (now() at time zone 'Europe/Rome')::date").fetchone()[0])
    payment = {'amount': '40', 'payment_method': 'Carta', 'paid_at': '2026-11-21T10:00:00Z'} if paid else None
    booking = confirm(conn, payload(ids, inventory_ids=ids, starts_on=today, ends_on=today,
                                   expected_total='40', payment=payment))
    request_id = str(uuid4())
    first = register_return(conn, request_id=request_id)
    assert str(first['booking_id']) == booking['id']
    timestamp = conn.execute('select returned_at,delivered_at,returned_by from rental_booking_items where rental_inventory_id=%s', (ids[0],)).fetchone()
    assert timestamp[0] is not None and timestamp[1] is None and str(timestamp[2]) == USER_A
    assert conn.execute('select status from rental_bookings where id=%s', (booking['id'],)).fetchone()[0] == 'active'
    assert register_return(conn, request_id=request_id) == first
    assert conn.execute('select returned_at from rental_booking_items where rental_inventory_id=%s', (ids[0],)).fetchone()[0] == timestamp[0]
    with pytest.raises(psycopg.errors.RaiseException), conn.transaction():
        register_return(conn, code='0002', request_id=request_id)
    register_return(conn, code='0002')
    assert conn.execute('select status from rental_bookings where id=%s', (booking['id'],)).fetchone()[0] == ('completed' if paid else 'active')
    with pytest.raises(psycopg.errors.RaiseException), conn.transaction():
        register_return(conn)
    # Il rientro fisico libera l'esemplare anche con saldo pendente.
    confirm(conn, payload(ids, starts_on=today, ends_on=today, expected_total='20'))


def test_return_future_wrong_site_and_no_direct_writes(setup):
    conn, ids, _, _ = setup
    future = str(conn.execute("select (now() at time zone 'Europe/Rome')::date + 20").fetchone()[0])
    confirm(conn, payload(ids, starts_on=future, ends_on=future, expected_total='20'))
    with pytest.raises(psycopg.errors.RaiseException), conn.transaction():
        register_return(conn)
    with pytest.raises(psycopg.errors.NoDataFound), conn.transaction():
        register_return(conn, site=SITE_B)
    with pytest.raises(psycopg.errors.InsufficientPrivilege), conn.transaction():
        conn.execute('update rental_booking_items set returned_at=now()')
    with pytest.raises(psycopg.errors.InsufficientPrivilege), conn.transaction():
        conn.execute('select * from rental_return_requests')
    assert conn.execute('select returned_at from rental_booking_items').fetchone()[0] is None


@pytest.mark.parametrize('same_code', [True, False])
def test_concurrent_returns_are_serialized(confirmation_database, same_code):
    owner, kwargs, ids, _, _ = confirmation_database
    booking_id = str(uuid4())
    today = str(owner.execute("select (now() at time zone 'Europe/Rome')::date").fetchone()[0])
    with owner.transaction():
        owner.execute('set local role authenticated')
        owner.execute("select set_config('request.jwt.claim.sub',%s,true)", (USER_A,))
        confirm(owner, payload(ids, starts_on=today, ends_on=today, inventory_ids=ids, expected_total='40',
            payment={'amount': '40', 'payment_method': 'Carta', 'paid_at': '2026-11-21T10:00:00Z'}), booking_id)
    barrier = Barrier(2)
    def run(index):
        try:
            with psycopg.connect(**kwargs) as conn:
                conn.execute('set local role authenticated')
                conn.execute("select set_config('request.jwt.claim.sub',%s,true)", (USER_A,))
                conn.execute("set local lock_timeout='5s'")
                barrier.wait(timeout=5)
                register_return(conn, code='+001' if same_code or index == 0 else '0002')
            return 'ok'
        except psycopg.errors.RaiseException:
            return 'already returned'
    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(run, [0, 1]))
        assert results.count('ok') == (1 if same_code else 2)
        status = owner.execute('select status from rental_bookings where id=%s', (booking_id,)).fetchone()[0]
        assert status == ('active' if same_code else 'completed')
    finally:
        owner.execute('delete from rental_return_requests where booking_id=%s', (booking_id,))
        owner.execute('delete from rental_payments where booking_id=%s', (booking_id,))
        owner.execute('delete from rental_booking_items where booking_id=%s', (booking_id,))
        owner.execute('delete from rental_bookings where id=%s', (booking_id,))


def record_payment(conn, booking_id, amount='20', payment_id=None, site=SITE_A):
    return conn.execute('select skirenting_register_rental_payment(%s,%s,%s,%s)',
        (site, booking_id, payment_id or str(uuid4()), Jsonb({'amount': amount, 'payment_method': 'Contanti',
         'paid_at': '2026-11-21T12:30:00Z', 'notes': 'Saldo'}))).fetchone()[0]


@pytest.mark.parametrize('already_completed', [False, True])
def test_return_payments_partial_full_and_idempotent(setup, already_completed):
    conn, ids, _, _ = setup
    today = str(conn.execute("select (now() at time zone 'Europe/Rome')::date").fetchone()[0])
    booking = confirm(conn, payload(ids, starts_on=today, ends_on=today, inventory_ids=ids, expected_total='40'))
    register_return(conn)
    with pytest.raises(psycopg.errors.RaiseException), conn.transaction():
        record_payment(conn, booking['id'])
    register_return(conn, code='0002')
    if already_completed:
        # Simula prenotazioni già concluse con un residuo, come nello storico.
        conn.execute('reset role')
        conn.execute("update rental_bookings set status='completed' where id=%s", (booking['id'],))
        conn.execute('set local role authenticated')
    payment_id = str(uuid4())
    first = record_payment(conn, booking['id'], payment_id=payment_id)
    assert record_payment(conn, booking['id'], payment_id=payment_id) == first
    assert conn.execute('select count(*) from rental_payments where booking_id=%s', (booking['id'],)).fetchone()[0] == 1
    assert conn.execute('select status from rental_bookings where id=%s', (booking['id'],)).fetchone()[0] == ('completed' if already_completed else 'active')
    with pytest.raises(psycopg.errors.RaiseException), conn.transaction():
        record_payment(conn, booking['id'], amount='10', payment_id=payment_id)
    with pytest.raises(psycopg.errors.RaiseException), conn.transaction():
        record_payment(conn, booking['id'], amount='21')
    final_id = str(uuid4())
    record_payment(conn, booking['id'], payment_id=final_id)
    record_payment(conn, booking['id'], payment_id=final_id)
    assert conn.execute('select sum(amount),count(*) from rental_payments where booking_id=%s', (booking['id'],)).fetchone() == (Decimal('40'), 2)
    assert conn.execute('select status from rental_bookings where id=%s', (booking['id'],)).fetchone()[0] == 'completed'


@pytest.mark.parametrize('amount', ['0', '-1', '1.001', 'NaN', 'Infinity'])
def test_return_payments_reject_invalid_amounts(setup, amount):
    conn, ids, _, _ = setup
    booking = confirm(conn, payload(ids))
    with pytest.raises(psycopg.errors.InvalidParameterValue), conn.transaction():
        record_payment(conn, booking['id'], amount=amount)
    assert conn.execute('select count(*) from rental_payments').fetchone()[0] == 0


def test_return_payment_site_and_direct_write_security(setup):
    conn, ids, _, _ = setup
    booking = confirm(conn, payload(ids))
    with pytest.raises(psycopg.errors.NoDataFound), conn.transaction():
        record_payment(conn, booking['id'], site=SITE_B)
    with pytest.raises(psycopg.errors.InsufficientPrivilege), conn.transaction():
        conn.execute("select set_config('request.jwt.claim.sub',%s,true)", (USER_B,))
        record_payment(conn, booking['id'], site=SITE_B)
    with pytest.raises(psycopg.errors.InsufficientPrivilege), conn.transaction():
        conn.execute("insert into rental_payments(booking_id,amount,payment_method,created_by) values(%s,20,'Carta',%s)", (booking['id'], USER_A))


def test_concurrent_balance_payments_do_not_overpay(confirmation_database):
    owner, kwargs, ids, _, _ = confirmation_database
    booking_id = str(uuid4())
    today = str(owner.execute("select (now() at time zone 'Europe/Rome')::date").fetchone()[0])
    with owner.transaction():
        owner.execute('set local role authenticated')
        owner.execute("select set_config('request.jwt.claim.sub',%s,true)", (USER_A,))
        confirm(owner, payload(ids, starts_on=today, ends_on=today, expected_total='20'), booking_id)
        register_return(owner)
    barrier = Barrier(2)
    def run(_):
        try:
            with psycopg.connect(**kwargs) as conn:
                conn.execute('set local role authenticated')
                conn.execute("select set_config('request.jwt.claim.sub',%s,true)", (USER_A,))
                conn.execute("set local lock_timeout='5s'")
                barrier.wait(timeout=5)
                record_payment(conn, booking_id)
            return 'ok'
        except psycopg.errors.RaiseException:
            return 'already paid'
    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(run, [0, 1]))
        assert results.count('ok') == 1
        assert owner.execute('select sum(amount),count(*) from rental_payments where booking_id=%s', (booking_id,)).fetchone() == (Decimal('20'), 1)
        assert owner.execute('select status from rental_bookings where id=%s', (booking_id,)).fetchone()[0] == 'completed'
    finally:
        owner.execute('delete from rental_return_requests where booking_id=%s', (booking_id,))
        owner.execute('delete from rental_payments where booking_id=%s', (booking_id,))
        owner.execute('delete from rental_booking_items where booking_id=%s', (booking_id,))
        owner.execute('delete from rental_bookings where id=%s', (booking_id,))


@pytest.mark.parametrize('status,return_material,message', [
    ('cancelled', True, 'annullato'),
    ('completed', False, 'Completa il rientro'),
])
def test_closed_payment_still_requires_valid_booking_and_returned_material(setup, status, return_material, message):
    conn, ids, _, _ = setup
    today = str(conn.execute("select (now() at time zone 'Europe/Rome')::date").fetchone()[0])
    booking = confirm(conn, payload(ids, starts_on=today, ends_on=today, expected_total='20'))
    if return_material:
        register_return(conn)
    conn.execute('reset role')
    conn.execute('update rental_bookings set status=%s where id=%s', (status, booking['id']))
    conn.execute('set local role authenticated')
    with pytest.raises(psycopg.errors.RaiseException, match=message), conn.transaction():
        record_payment(conn, booking['id'])
    assert conn.execute('select count(*) from rental_payments where booking_id=%s', (booking['id'],)).fetchone()[0] == 0


def test_customer_delete_preserves_rentals_payments_and_import_archive(setup):
    conn, ids, _, _ = setup
    today = str(conn.execute("select (now() at time zone 'Europe/Rome')::date").fetchone()[0])
    booking = confirm(conn, payload(ids, starts_on=today, ends_on=today, expected_total='20',
        payment={'amount':'20','payment_method':'Carta','paid_at':'2026-11-21T10:00:00Z'}))
    batch_id = str(uuid4())
    conn.execute('reset role')
    conn.execute("insert into customer_import_batches(id,source_filename,source_sha256,source_headers,row_count) values(%s,'sample.csv',%s,'[]',1)", (batch_id,'a'*64))
    conn.execute("insert into customer_import_rows(batch_id,source_row,customer_id,raw_data) values(%s,1,%s,'{}')", (batch_id,USER_A))
    conn.execute('set local role authenticated')
    conn.execute('select skirenting_delete_customer(%s)', (USER_A,))
    first_deleted_at = conn.execute('select deleted_at from customers where id=%s', (USER_A,)).fetchone()[0]
    assert first_deleted_at is not None
    conn.execute('select skirenting_delete_customer(%s)', (USER_A,))
    assert conn.execute('select deleted_at from customers where id=%s', (USER_A,)).fetchone()[0] == first_deleted_at
    assert conn.execute('select count(*) from customers where deleted_at is null and id=%s', (USER_A,)).fetchone()[0] == 0
    row = conn.execute('select c.first_name,b.customer_id from rental_bookings b join customers c on c.id=b.customer_id where b.id=%s', (booking['id'],)).fetchone()
    assert row[0] == 'Mario' and str(row[1]) == USER_A
    assert conn.execute('select sum(amount) from rental_payments where booking_id=%s', (booking['id'],)).fetchone()[0] == Decimal('20')
    register_return(conn)  # I rientri dei vecchi noleggi continuano a funzionare.
    with pytest.raises(psycopg.errors.RaiseException, match='Cliente non più disponibile'), conn.transaction():
        confirm(conn, payload(ids, inventory_ids=[ids[1]], starts_on=today, ends_on=today, expected_total='20'))
    conn.execute('reset role')
    assert conn.execute('select count(*) from customer_import_rows where batch_id=%s', (batch_id,)).fetchone()[0] == 1
    conn.execute('set local role authenticated')


def test_customer_delete_requires_operator_access_and_flags_are_protected(setup):
    conn, _, _, _ = setup
    for role in ['anon', 'authenticated']:
        with pytest.raises(psycopg.errors.InsufficientPrivilege), conn.transaction():
            conn.execute(f'set local role {role}')
            conn.execute("select set_config('request.jwt.claim.sub',%s,true)", (str(uuid4()),))
            conn.execute('select skirenting_delete_customer(%s)', (USER_A,))
    with pytest.raises(psycopg.errors.InsufficientPrivilege), conn.transaction():
        conn.execute('update customers set deleted_at=now() where id=%s', (USER_A,))
    with pytest.raises(psycopg.errors.InsufficientPrivilege), conn.transaction():
        conn.execute('delete from customers where id=%s', (USER_A,))
    with pytest.raises(psycopg.errors.NoDataFound), conn.transaction():
        conn.execute('select skirenting_delete_customer(%s)', (str(uuid4()),))
    assert conn.execute('select deleted_at from customers where id=%s', (USER_A,)).fetchone()[0] is None
