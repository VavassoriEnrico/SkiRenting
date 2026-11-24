from collections import Counter
from uuid import UUID

import httpx

from app.repositories.rental_inventory_repository import read_all

CUSTOMER_FIELDS = 'id,first_name,last_name,email,phone,notes,birth_date,skill_level,language,country_code,is_legacy'


def list_customers(client: httpx.Client) -> list[dict]:
    customers = []
    while True:
        response = client.get(
            '/rest/v1/customers',
            params={
                'select': CUSTOMER_FIELDS,
                'order': 'last_name,first_name,id',
                'deleted_at': 'is.null',
                'limit': '500',
                'offset': str(len(customers)),
            },
        )
        response.raise_for_status()
        page = response.json()
        if not page:
            return customers
        customers.extend(page)


def create_customer(client: httpx.Client, data: dict) -> dict:
    response = client.post(
        '/rest/v1/customers',
        params={'select': CUSTOMER_FIELDS},
        headers={'Prefer': 'return=representation'},
        json=data,
    )
    response.raise_for_status()
    return response.json()[0]


def update_customer(client: httpx.Client, customer_id: UUID, data: dict) -> dict | None:
    response = client.patch('/rest/v1/customers', params={
        'id': f'eq.{customer_id}', 'deleted_at': 'is.null', 'select': CUSTOMER_FIELDS,
    }, headers={'Prefer': 'return=representation'}, json=data)
    response.raise_for_status()
    rows = response.json()
    return rows[0] if rows else None


def delete_customer(client: httpx.Client, customer_id: UUID):
    response = client.post('/rest/v1/rpc/skirenting_delete_customer', json={'p_customer_id': str(customer_id)})
    response.raise_for_status()


def get_customer(client: httpx.Client, customer_id: UUID) -> dict | None:
    response = client.get('/rest/v1/customers', params={
        'id': f'eq.{customer_id}', 'deleted_at': 'is.null', 'select': CUSTOMER_FIELDS, 'limit': '1',
    })
    response.raise_for_status()
    rows = response.json()
    return rows[0] if rows else None


def booking_counts(client: httpx.Client, location_ids: list[str]) -> Counter:
    rows = read_all(client, 'rental_bookings', {
        'select': 'id,customer_id', 'deleted_at': 'is.null',
        'location_id': f"in.({','.join(location_ids)})", 'order': 'id',
    })
    return Counter(row['customer_id'] for row in rows if row.get('customer_id'))
