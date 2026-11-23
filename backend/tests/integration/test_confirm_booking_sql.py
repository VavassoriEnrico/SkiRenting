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
                             '017_customer_management.sql', '017_customer_management.sql',
                             '018_material_repairs.sql', '018_material_repairs.sql',
                             '019_material_repairs_workflow.sql', '019_material_repairs_workflow.sql',
                             '020_promotions.sql', '020_promotions.sql',
                             '021_apply_rental_promotions.sql', '021_apply_rental_promotions.sql',
                             '022_promotions_period.sql', '022_promotions_period.sql']:
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


def test_material_repairs_constraints_and_completed_history(setup):
    conn, ids, _, _ = setup
    conn.execute('reset role')
    repair = conn.execute("insert into material_repairs(rental_inventory_id,repair_type,created_by) values(%s,'edges_and_wax',%s) returning id", (ids[0],USER_A)).fetchone()[0]
    with pytest.raises(psycopg.errors.UniqueViolation), conn.transaction():
        conn.execute("insert into material_repairs(rental_inventory_id,repair_type,created_by) values(%s,'wax',%s)", (ids[0],USER_A))
    with pytest.raises(psycopg.errors.CheckViolation), conn.transaction():
        conn.execute("update material_repairs set status='completed' where id=%s", (repair,))
    with pytest.raises(psycopg.errors.CheckViolation), conn.transaction():
        conn.execute("update material_repairs set status='completed',completed_at=sent_at-interval '1 minute' where id=%s", (repair,))
    conn.execute("update material_repairs set status='completed',completed_at=sent_at where id=%s", (repair,))
    second = conn.execute("insert into material_repairs(rental_inventory_id,repair_type,created_by) values(%s,'wax',%s) returning id", (ids[0],USER_A)).fetchone()[0]
    conn.execute("update material_repairs set status='cancelled' where id=%s", (second,))
    conn.execute("insert into material_repairs(rental_inventory_id,repair_type,created_by) values(%s,'edges',%s)", (ids[0],USER_A))
    assert conn.execute('select count(*) from material_repairs where rental_inventory_id=%s', (ids[0],)).fetchone()[0] == 3
    conn.execute('set local role authenticated')


def test_material_repairs_visibility_and_operator_writes(setup):
    conn, ids, _, _ = setup
    conn.execute('reset role')
    conn.execute('update rental_inventory set location_id=%s where id=%s', (SITE_B,ids[1]))
    for inventory_id in ids:
        conn.execute("insert into material_repairs(rental_inventory_id,repair_type,created_by) values(%s,'wax',%s)", (inventory_id,USER_A))
    conn.execute('set local role authenticated')
    conn.execute("select set_config('request.jwt.claim.sub',%s,true)", (USER_B,))
    assert [str(row[0]) for row in conn.execute('select rental_inventory_id from material_repairs').fetchall()] == [ids[0]]
    with pytest.raises(psycopg.errors.InsufficientPrivilege), conn.transaction():
        conn.execute("insert into material_repairs(rental_inventory_id,repair_type) values(%s,'edges')", (ids[0],))
    with pytest.raises(psycopg.errors.InsufficientPrivilege), conn.transaction():
        conn.execute("update material_repairs set status='cancelled'")
    with pytest.raises(psycopg.errors.InsufficientPrivilege), conn.transaction():
        conn.execute('set local role anon')
        conn.execute('select * from material_repairs')


def send_for_repair(conn, code='+001', repair_id=None, site=SITE_A):
    return conn.execute('select skirenting_create_material_repair(%s,%s,%s,%s,%s)',
        (site,repair_id or str(uuid4()),code,'edges_and_wax','Lavoro')).fetchone()[0]


def finish_repair(conn, repair_id, item_id, site=SITE_A):
    return conn.execute('select skirenting_complete_material_repair(%s,%s,%s)',(site,repair_id,item_id)).fetchone()[0]


def test_repair_closes_on_acknowledgement_and_allows_new_rental(setup):
    conn,ids,_,_=setup
    request_id=str(uuid4())
    first=send_for_repair(conn,repair_id=request_id)
    assert send_for_repair(conn,repair_id=request_id)==first
    assert conn.execute('select status from rental_inventory where id=%s',(ids[0],)).fetchone()[0]=='maintenance'
    assert conn.execute('select count(*) from material_repairs').fetchone()[0]==1
    with pytest.raises(psycopg.errors.RaiseException),conn.transaction():
        confirm(conn,payload(ids))
    finish_repair(conn,request_id,ids[0])
    completed=conn.execute('select status,completed_at,completed_by from material_repairs where id=%s',(request_id,)).fetchone()
    assert completed[0]=='completed' and completed[1] is not None and str(completed[2])==USER_A
    assert conn.execute('select count(*) from rental_bookings').fetchone()[0]==0
    finish_repair(conn,request_id,ids[0])
    assert conn.execute('select completed_at from material_repairs where id=%s',(request_id,)).fetchone()[0]==completed[1]
    assert conn.execute('select status from rental_inventory where id=%s',(ids[0],)).fetchone()[0]=='active'
    confirm(conn,payload(ids))
    # Un vecchio consenso non deve chiudere un nuovo intervento sullo stesso codice.
    conn.execute('reset role')
    conn.execute("update rental_booking_items set returned_at=now() where rental_inventory_id=%s",(ids[0],))
    conn.execute('set local role authenticated')
    new_repair=send_for_repair(conn)
    with pytest.raises(psycopg.errors.RaiseException),conn.transaction():
        finish_repair(conn,request_id,ids[0])
    assert conn.execute('select status from material_repairs where id=%s',(new_repair['id'],)).fetchone()[0]=='in_progress'


def test_open_repair_cannot_be_bypassed_by_direct_booking_confirmation(setup):
    conn,ids,_,_=setup
    conn.execute('reset role')
    repair_id=conn.execute("insert into material_repairs(rental_inventory_id,repair_type,created_by) values(%s,'wax',%s) returning id",(ids[0],USER_A)).fetchone()[0]
    conn.execute('set local role authenticated')
    with pytest.raises(psycopg.errors.RaiseException,match='Articolo in riparazione'),conn.transaction():
        confirm(conn,payload(ids))
    assert conn.execute('select status from material_repairs where id=%s',(repair_id,)).fetchone()[0]=='in_progress'


def test_repair_permissions_and_no_repair_for_a_rented_item(setup):
    conn,ids,_,_=setup
    today=str(conn.execute("select (now() at time zone 'Europe/Rome')::date").fetchone()[0])
    confirm(conn,payload(ids,starts_on=today,ends_on=today,expected_total='20'))
    with pytest.raises(psycopg.errors.RaiseException,match='noleggio in corso'),conn.transaction():
        send_for_repair(conn)
    register_return(conn)
    repair=send_for_repair(conn)
    with pytest.raises(psycopg.errors.NoDataFound),conn.transaction():
        finish_repair(conn,repair['id'],ids[0],site=SITE_B)
    with pytest.raises(psycopg.errors.InsufficientPrivilege),conn.transaction():
        conn.execute("select set_config('request.jwt.claim.sub',%s,true)",(USER_B,))
        send_for_repair(conn,site=SITE_B)
    with pytest.raises(psycopg.errors.InsufficientPrivilege),conn.transaction():
        conn.execute('set local role anon')
        finish_repair(conn,repair['id'],ids[0])
    conn.execute('reset role')
    conn.execute("update rental_inventory set status='lost' where id=%s",(ids[0],))
    conn.execute('set local role authenticated')
    with pytest.raises(psycopg.errors.RaiseException),conn.transaction():
        finish_repair(conn,repair['id'],ids[0])
    assert conn.execute('select status from material_repairs where id=%s',(repair['id'],)).fetchone()[0]=='in_progress'


def test_repairs_only_accept_skis_and_snowboards(setup):
    conn,_,_,_=setup
    category_id,group_id=conn.execute("select c.id,g.id from material_categories c join material_groups g on g.category_id=c.id where c.detail_type='helmet' limit 1").fetchone()
    data={'category_id':str(category_id),'group_id':str(group_id),'code':'H001',
          'new_variant':{'brand':'Marca','model':'Casco','details':{'size_label':'M'}}}
    conn.execute('select skirenting_create_rental_item(%s,%s)',(SITE_A,Jsonb(data)))
    with pytest.raises(psycopg.errors.InvalidParameterValue),conn.transaction():
        send_for_repair(conn,code='H001')


def test_repair_and_current_rental_cannot_both_claim_an_item(confirmation_database):
    owner,kwargs,ids,_,_=confirmation_database
    booking_id=str(uuid4());repair_id=str(uuid4())
    today=str(owner.execute("select (now() at time zone 'Europe/Rome')::date").fetchone()[0])
    barrier=Barrier(2)
    def run(action):
        try:
            with psycopg.connect(**kwargs) as conn:
                conn.execute('set local role authenticated')
                conn.execute("select set_config('request.jwt.claim.sub',%s,true)",(USER_A,))
                conn.execute("set local lock_timeout='5s'")
                barrier.wait(timeout=5)
                if action=='repair': send_for_repair(conn,repair_id=repair_id)
                else: confirm(conn,payload(ids,starts_on=today,ends_on=today,expected_total='20'),booking_id)
            return 'ok'
        except psycopg.errors.RaiseException:
            return 'conflict'
    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            results=list(pool.map(run,['repair','rental']))
        assert results.count('ok')==1 and results.count('conflict')==1
    finally:
        owner.execute('delete from material_repairs where id=%s',(repair_id,))
        owner.execute('delete from rental_booking_items where booking_id=%s',(booking_id,))
        owner.execute('delete from rental_bookings where id=%s',(booking_id,))
        owner.execute("update rental_inventory set status='active' where id=%s",(ids[0],))


@pytest.mark.parametrize('promotion_date,weekdays,discount',[
    (None,[],10), ('2026-12-25',[2],10), (None,[0],10), (None,[8],10),
    (None,[2,2],10), (None,[None],10), ('2026-12-25',[],101), ('2026-12-25',[],-1),
])
def test_promotions_sql_rejects_invalid_schedule_and_discount(setup,promotion_date,weekdays,discount):
    conn,*_=setup
    with pytest.raises(psycopg.errors.CheckViolation),conn.transaction():
        conn.execute("insert into promotions(name,promotion_date,weekdays,discount_percent) values('Promo test',%s,%s,%s)",(promotion_date,weekdays,discount))


def test_promotions_sql_shared_access_and_soft_remove(setup):
    conn,*_=setup
    row=conn.execute("insert into promotions(name,promotion_date,discount_percent) values('Natale','2026-12-25',15.5) returning id,created_at,weekdays,is_active").fetchone()
    assert row[1] is not None and row[2] == [] and row[3]
    weekly=conn.execute("insert into promotions(name,weekdays,discount_percent) values('Settimanale',array[2,4]::smallint[],10) returning id").fetchone()[0]
    conn.execute("select set_config('request.jwt.claim.sub',%s,true)",(USER_B,))
    assert conn.execute('select discount_percent from promotions where id=%s',(weekly,)).fetchone()[0] == 10
    conn.execute('update promotions set is_active=false where id=%s',(weekly,))
    assert conn.execute('select is_active from promotions where id=%s',(weekly,)).fetchone() == (False,)
    with pytest.raises(psycopg.errors.InsufficientPrivilege),conn.transaction():
        conn.execute('delete from promotions where id=%s',(weekly,))
    with pytest.raises(psycopg.errors.InsufficientPrivilege),conn.transaction():
        conn.execute('update promotions set created_at=now() where id=%s',(weekly,))
    with pytest.raises(psycopg.errors.InsufficientPrivilege),conn.transaction():
        conn.execute('set local role anon')
        conn.execute('select * from promotions')
    # Profilo esistente ma nessuna sede assegnata: lettura vuota e inserimento negato.
    conn.execute('reset role')
    conn.execute('delete from operator_locations where operator_id=%s',(USER_B,))
    conn.execute('set local role authenticated')
    assert conn.execute('select count(*) from promotions').fetchone()[0] == 0
    with pytest.raises(psycopg.errors.InsufficientPrivilege),conn.transaction():
        conn.execute("insert into promotions(name,weekdays,discount_percent) values('Settimanale',array[2]::smallint[],10)")


@pytest.mark.parametrize('days,hotel_discount,promotions,expected,winning_name',[
    (1,0,[(None,[2],10,'Martedì'),('2026-12-01',[],25,'Giornata')],'15.00','Giornata'),
    (1,30,[('2026-12-01',[],25,'Giornata')],'14.00',None),
    (1,15,[('2026-12-01',[],15,'Pari')],'17.00',None),
    (1,0,[('2026-12-02',[],90,'Domani'),(None,[4],80,'Giovedì')],'20.00',None),
    (3,15,[('2026-12-01',[],90,'Solo un giorno'),(None,[2],80,'Martedì')],'40.80',None),
    (1,0,[('2026-12-01',[],100,'Gratis')],'0.00','Gratis'),
])
def test_confirm_uses_only_highest_discount_for_single_day(setup,days,hotel_discount,promotions,expected,winning_name):
    conn,ids,hotel,_=setup
    # Test owner configures the hotel, then the operator creates promotions.
    conn.execute('reset role')
    conn.execute('update hotels set discount=%s where id=%s',(hotel_discount,hotel))
    conn.execute('set local role authenticated')
    for day,weekdays,percent,name in promotions:
        conn.execute('insert into promotions(name,promotion_date,weekdays,discount_percent) values(%s,%s,%s,%s)',(name,day,weekdays,percent))
    data=payload(ids,starts_on='2026-12-01',ends_on=f'2026-12-0{days}',hotel_id=hotel,expected_total=expected)
    booking_id=str(uuid4())
    result=confirm(conn,data,booking_id)
    assert Decimal(str(result['total'])) == Decimal(expected)
    row=conn.execute('select promotion_name,discount_percent from rental_bookings where id=%s',(booking_id,)).fetchone()
    assert row[0] == winning_name
    assert row[1] == (100-Decimal(expected)/(20 if days==1 else 48)*100)
    # Idempotent retry does not recalculate after changing the promotion configuration.
    conn.execute('update promotions set is_active=false')
    assert Decimal(str(confirm(conn,data,booking_id)['total'])) == Decimal(expected)
    assert conn.execute('select promotion_name from rental_bookings where id=%s',(booking_id,)).fetchone()[0] == winning_name


def test_confirmation_rejects_stale_promotion_total_without_saving(setup):
    conn,ids,*_=setup
    conn.execute("insert into promotions(name,promotion_date,discount_percent) values('Giornata','2026-12-01',25)")
    booking_id=str(uuid4())
    with pytest.raises(psycopg.errors.RaiseException,match='Listino o sconto cambiati'),conn.transaction():
        confirm(conn,payload(ids,starts_on='2026-12-01',ends_on='2026-12-01',expected_total='20'),booking_id)
    assert conn.execute('select count(*) from rental_bookings where id=%s',(booking_id,)).fetchone()[0] == 0


@pytest.mark.parametrize('day,expected',[
    ('2026-11-30','20.00'),('2026-12-01','15.00'),('2026-12-15','15.00'),('2026-12-31','15.00'),('2027-01-01','20.00'),
])
def test_confirmation_period_promotion_includes_first_and_last_day(setup,day,expected):
    conn,ids,*_=setup
    conn.execute("insert into promotions(name,starts_on,ends_on,discount_percent) values('Dicembre','2026-12-01','2026-12-31',25)")
    result=confirm(conn,payload(ids,starts_on=day,ends_on=day,expected_total=expected))
    assert Decimal(str(result['total']))==Decimal(expected)
    if expected=='15.00':
        assert conn.execute('select promotion_name from rental_bookings where id=%s',(result['id'],)).fetchone()[0]=='Dicembre'


@pytest.mark.parametrize('start,end,promotion_date,weekdays',[
    ('2026-12-01',None,None,[]),(None,'2026-12-31',None,[]),
    ('2026-12-31','2026-12-01',None,[]),
    ('2026-12-01','2026-12-31','2026-12-01',[]),
    ('2026-12-01','2026-12-31',None,[2]),
])
def test_promotions_sql_rejects_incomplete_or_mixed_periods(setup,start,end,promotion_date,weekdays):
    conn,*_=setup
    with pytest.raises(psycopg.errors.CheckViolation),conn.transaction():
        conn.execute('insert into promotions(name,starts_on,ends_on,promotion_date,weekdays,discount_percent) values(%s,%s,%s,%s,%s,25)',
                     ('Periodo',start,end,promotion_date,weekdays))


def test_confirmation_periods_compete_with_weekly_hotel_and_ignore_multi_day(setup):
    conn,ids,hotel,*_=setup
    conn.execute("insert into promotions(name,starts_on,ends_on,discount_percent) values('Periodo','2026-12-01','2026-12-31',25)")
    conn.execute("insert into promotions(name,weekdays,discount_percent) values('Martedì',array[2]::smallint[],30)")
    result=confirm(conn,payload(ids,starts_on='2026-12-01',ends_on='2026-12-01',hotel_id=hotel,expected_total='14'))
    assert Decimal(str(result['total']))==14
    # A second specimen avoids overlapping inventory; hotel discount only for several days.
    result=confirm(conn,payload([ids[1]],starts_on='2026-12-01',ends_on='2026-12-03',hotel_id=hotel,expected_total='40.80'))
    assert Decimal(str(result['total']))==Decimal('40.80')
