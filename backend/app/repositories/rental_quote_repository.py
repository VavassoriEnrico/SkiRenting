from uuid import UUID

import httpx

from app.repositories.rental_inventory_repository import ITEM_SELECT, read_all

PRICE_FIELDS = (
    'group_id,daily_price_1_day,daily_price_2_days,daily_price_3_days,daily_price_4_days,'
    'daily_price_5_days,daily_price_6_days,daily_price_7_plus_days'
)


def get_items(client: httpx.Client, location_id: UUID, ids: list[UUID]) -> list[dict]:
    items = []
    for start in range(0, len(ids), 100):
        identifiers = ','.join(str(value) for value in ids[start:start + 100])
        items.extend(read_all(client, 'rental_inventory', {
            'select': ITEM_SELECT, 'location_id': f'eq.{location_id}',
            'id': f'in.({identifiers})', 'order': 'id',
        }))
    return items


def get_rates(client: httpx.Client, group_ids: list[str]) -> list[dict]:
    rates = []
    for start in range(0, len(group_ids), 100):
        identifiers = ','.join(group_ids[start:start + 100])
        rates.extend(read_all(client, 'rental_rates', {
            'select': PRICE_FIELDS, 'group_id': f'in.({identifiers})', 'order': 'id',
        }))
    return rates


def get_hotel(client: httpx.Client, hotel_id: UUID) -> dict | None:
    response = client.get('/rest/v1/hotels', params={
        'id': f'eq.{hotel_id}', 'is_active': 'eq.true',
        'select': 'id,name,discount', 'limit': '1',
    })
    response.raise_for_status()
    rows = response.json()
    return rows[0] if rows else None
