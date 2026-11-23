"""SQL reale su un database effimero. Richiede SKIRENTING_TEST_PG_HOST e PG_PORT.

Non usare un server remoto: il test crea e rimuove solo il proprio database casuale.
"""
import os
from pathlib import Path
from uuid import uuid4

import psycopg
import pytest
from psycopg import sql
from psycopg.types.json import Jsonb

pytestmark = pytest.mark.skipif(
    not os.environ.get('SKIRENTING_TEST_PG_HOST'), reason='PostgreSQL temporaneo non configurato',
)
USER = '10000000-0000-0000-0000-000000000001'
SITE = '20000000-0000-0000-0000-000000000001'
OTHER_SITE = '20000000-0000-0000-0000-000000000002'


@pytest.fixture(scope='module')
def database():
    host = os.environ['SKIRENTING_TEST_PG_HOST']
    assert host.startswith('/private/tmp/'), 'Il test richiede un socket PostgreSQL temporaneo.'
    kwargs = {'host': host, 'port': os.environ.get('SKIRENTING_TEST_PG_PORT', '55439')}
    name = f'skirenting_create_test_{uuid4().hex}'
    with psycopg.connect(dbname='postgres', autocommit=True, **kwargs) as admin:
        admin.execute(sql.SQL('create database {}').format(sql.Identifier(name)))
        try:
            with psycopg.connect(dbname=name, autocommit=True, **kwargs) as conn:
                conn.execute('''
                    create schema auth;
                    create table auth.users(id uuid primary key);
                    create function auth.uid() returns uuid language sql stable as $$
                        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
                    $$;
                    grant usage on schema auth to authenticated, anon;
                    create table public.locations(id uuid primary key, name text not null);
                    create table public.operator_profiles(
                        id uuid primary key references auth.users(id),
                        created_at timestamptz default now(), name text not null
                    );
                    create table public.operator_locations(
                        operator_id uuid references public.operator_profiles(id),
                        location_id uuid references public.locations(id),
                        primary key(operator_id, location_id)
                    );
                ''')
                conn.execute('insert into auth.users values(%s)', (USER,))
                conn.execute('insert into operator_profiles(id,name) values(%s,%s)', (USER, 'Banco'))
                conn.execute('insert into locations values(%s,%s),(%s,%s)',
                             (SITE, 'Madesimo', OTHER_SITE, 'Altra sede'))
                conn.execute('insert into operator_locations values(%s,%s)', (USER, SITE))
                scripts = Path(__file__).resolve().parents[2] / 'sql'
                for file in ['001_operator_read_policies.sql',
                             '002_material_catalog_and_inventory.sql',
                             '005_create_rental_item.sql', '005_create_rental_item.sql']:
                    conn.execute((scripts / file).read_text(), prepare=False)
                yield conn
        finally:
            admin.execute(sql.SQL('drop database {}').format(sql.Identifier(name)))


@pytest.fixture
def db(database):
    # Tutti i dati del singolo test vengono annullati anche in caso di errore.
    with database.transaction(force_rollback=True):
        database.execute('set local role authenticated')
        database.execute("select set_config('request.jwt.claim.sub',%s,true)", (USER,))
        yield database


def payload(db, code='+001'):
    category = db.execute("select id from material_categories where code='ski'").fetchone()[0]
    group = db.execute('select id from material_groups where category_id=%s limit 1', (category,)).fetchone()[0]
    return {
        'category_id': str(category), 'group_id': str(group), 'code': code,
        'new_variant': {'brand': 'Test', 'model': 'Sci', 'year': 2026,
                        'details': {'length_cm': 164}},
    }


def create(db, body, site=SITE):
    return db.execute('select skirenting_create_rental_item(%s,%s)', (site, Jsonb(body))).fetchone()[0]


def test_create_reuses_identical_variant_and_preserves_codes(db):
    first = create(db, payload(db))
    second = create(db, payload(db, '0002'))
    assert first['variant_id'] == second['variant_id']
    assert first['code'] == '+001'
    assert db.execute('select count(*) from rental_inventory').fetchone()[0] == 2
    assert db.execute('select length_cm from ski_details').fetchone()[0] == 164
    assert db.execute('select count(*) from sale_inventory').fetchone()[0] == 0


def test_new_category_new_group_and_boot_fields(db):
    body = {
        'new_category': {'name': 'Scarponi speciali', 'code': 'special_boots', 'detail_type': 'boots'},
        'new_group': 'Speciali', 'code': 'BOOT001',
        'new_variant': {'brand': 'Test', 'model': 'Boot', 'details': {
            'size_label': '24.5',
        }},
    }
    result = create(db, body)
    details = db.execute('select size_label from boot_details where variant_id=%s',
                         (result['variant_id'],)).fetchone()
    assert details == ('24.5',)


def test_existing_variant_does_not_change_shared_model(db):
    first = create(db, payload(db))
    second_body = payload(db, 'OTHER')
    del second_body['new_variant']
    second_body['variant_id'] = first['variant_id']
    assert create(db, second_body)['variant_id'] == first['variant_id']


def test_duplicate_code_rolls_back(db):
    create(db, payload(db))
    with pytest.raises(psycopg.errors.UniqueViolation), db.transaction():
        create(db, payload(db))
    assert db.execute('select count(*) from rental_inventory').fetchone()[0] == 1


def test_invalid_details_roll_back_new_category_and_group(db):
    body = {
        'new_category': {'name': 'Test extra', 'code': 'test_extra', 'detail_type': 'ski'},
        'new_group': 'Extra', 'code': 'INVALID',
        'new_variant': {'brand': 'Test', 'model': 'Sci', 'details': {'length_cm': -1}},
    }
    with pytest.raises(psycopg.errors.CheckViolation), db.transaction():
        create(db, body)
    assert db.execute("select count(*) from material_categories where code='test_extra'").fetchone()[0] == 0
    assert db.execute("select count(*) from material_groups where name='Extra'").fetchone()[0] == 0


def test_other_site_is_rejected_even_via_direct_rpc(db):
    with pytest.raises(psycopg.errors.InsufficientPrivilege), db.transaction():
        create(db, payload(db), OTHER_SITE)


def test_foreign_group_and_variant_are_rejected(db):
    body = payload(db)
    body['group_id'] = str(db.execute('select id from material_groups where category_id<>%s limit 1',
                                     (body['category_id'],)).fetchone()[0])
    with pytest.raises(psycopg.errors.InvalidParameterValue), db.transaction():
        create(db, body)


def test_anon_and_direct_table_writes_are_rejected(db):
    with pytest.raises(psycopg.errors.InsufficientPrivilege), db.transaction():
        db.execute('set local role anon')
        create(db, {})
    with pytest.raises(psycopg.errors.InsufficientPrivilege), db.transaction():
        db.execute("insert into material_categories(code,name) values('bad','Bad')")


@pytest.mark.parametrize('family,details,table', [
    ('snowboard', {'length_cm': 150}, 'snowboard_details'),
    ('helmet', {'size_label': 'M'}, 'helmet_details'),
    ('poles', {'height_cm': 120}, 'pole_details'),
    ('goggles', {'lens': 'S2'}, 'goggle_details'),
    ('accessory', {'size_label': 'Unica'}, 'accessory_details'),
])
def test_all_detail_families(db, family, details, table):
    body = {
        'new_category': {'name': 'Categoria test', 'code': 'test_custom', 'detail_type': family},
        'new_group': 'Gruppo test', 'code': 'TEST001',
        'new_variant': {'brand': 'Test', 'model': 'Test', 'details': details},
    }
    result = create(db, body)
    stored = db.execute(sql.SQL('select to_jsonb(d) from {} d where variant_id=%s').format(
        sql.Identifier(table)), (result['variant_id'],)).fetchone()[0]
    for key, value in details.items():
        assert stored[key] == value
