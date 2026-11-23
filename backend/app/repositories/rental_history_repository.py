from datetime import date
from uuid import UUID

import httpx

from app.repositories.rental_inventory_repository import read_all
from app.repositories.customer_repository import CUSTOMER_FIELDS

HEADER_FIELDS = (
    'id,booking_number,customer_id,location_id,starts_on,ends_on,status,discount_percent,promotion_id,promotion_name,rental_kind,season_id,notes,'
    f'created_by,created_at,updated_at,customer:customers({CUSTOMER_FIELDS}),'
    'hotel:hotels(id,name)'
)
ITEM_FIELDS = (
    'id,booking_id,rental_inventory_id,code_snapshot,brand_snapshot,model_snapshot,size_snapshot,'
    'daily_price,amount,seasonal_pricing,seasonal_pack_main_id,delivered_at,returned_at,created_at,updated_at'
)
PAYMENT_FIELDS = 'id,booking_id,payment_method,amount,paid_at,created_by,notes,created_at'


def get_headers(client: httpx.Client, location_id: UUID, history_only: bool, booking_id: UUID | None = None):
    params = {'select': HEADER_FIELDS, 'location_id': f'eq.{location_id}', 'deleted_at': 'is.null',
              'order': 'starts_on.desc,booking_number.desc,id'}
    if history_only:
        params['status'] = 'in.(completed,cancelled)'
    if booking_id:
        params['id'] = f'eq.{booking_id}'
    return read_all(client, 'rental_bookings', params)


def read_children(client: httpx.Client, headers: list[dict], table: str, fields: str, order: str) -> list[dict]:
    rows = []
    for start in range(0, len(headers), 100):
        identifiers = ','.join(row['id'] for row in headers[start:start + 100])
        rows.extend(read_all(client, table, {
            'select': fields, 'booking_id': f'in.({identifiers})', 'order': order,
        }))
    return rows


def get_children(client: httpx.Client, headers: list[dict]) -> tuple[list[dict], list[dict]]:
    return (
        read_children(client, headers, 'rental_booking_items', ITEM_FIELDS, 'code_snapshot,id'),
        read_children(client, headers, 'rental_payments', PAYMENT_FIELDS, 'paid_at,id'),
    )


def get_due_headers(client: httpx.Client, location_id: UUID, due_on: date) -> list[dict]:
    return read_all(client, 'rental_bookings', {
        'select': HEADER_FIELDS, 'location_id': f'eq.{location_id}', 'deleted_at': 'is.null',
        'ends_on': f'eq.{due_on.isoformat()}', 'status': 'in.(confirmed,preparing,active,completed)',
        'order': 'booking_number,id',
    })


def register_return(client: httpx.Client, location_id: UUID, request_id: UUID, code: str, booking_id: UUID | None = None) -> dict:
    payload = {
        'p_location_id': str(location_id), 'p_request_id': str(request_id), 'p_code': code,
    }
    function = 'skirenting_register_rental_return'
    if code == '1':
        function = 'skirenting_register_generic_return'
        payload['p_booking_id'] = str(booking_id) if booking_id else None
    response = client.post(f'/rest/v1/rpc/{function}', json=payload)
    response.raise_for_status()
    return response.json()


def get_customer_headers(client: httpx.Client, customer_id: UUID, location_ids: list[str]) -> list[dict]:
    headers = []
    for start in range(0, len(location_ids), 100):
        identifiers = ','.join(location_ids[start:start + 100])
        headers.extend(read_all(client, 'rental_bookings', {
            'select': HEADER_FIELDS, 'customer_id': f'eq.{customer_id}', 'deleted_at': 'is.null',
            'location_id': f'in.({identifiers})', 'order': 'starts_on.desc,ends_on.desc,booking_number.desc,id',
        }))
    return sorted(headers, key=lambda row: (row['starts_on'],row['ends_on'],row['booking_number'],row['id']), reverse=True)


def delete_booking(client: httpx.Client, location_id: UUID, booking_id: UUID):
    response = client.post('/rest/v1/rpc/skirenting_delete_rental_booking', json={
        'p_location_id': str(location_id), 'p_booking_id': str(booking_id),
    })
    response.raise_for_status()
