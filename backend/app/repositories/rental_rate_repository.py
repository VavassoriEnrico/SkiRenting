from uuid import UUID

import httpx

from app.repositories.rental_inventory_repository import list_categories, read_all

FIELDS = (
    'id,group_id,daily_price_1_day,daily_price_2_days,daily_price_3_days,'
    'daily_price_4_days,daily_price_5_days,daily_price_6_days,daily_price_7_plus_days,'
    'group:material_groups(id,name,is_active,category:material_categories(id,code,name))'
)


def list_rates(client: httpx.Client) -> dict:
    return {
        'categories': list_categories(client),
        'rates': read_all(client, 'rental_rates', {
            'select': FIELDS.replace('group:material_groups(', 'group:material_groups!inner('),
            'order': 'id', 'group.is_active': 'eq.true',
        }),
    }


def update_rate(client: httpx.Client, rate_id: UUID, prices: dict) -> dict | None:
    response = client.patch(
        '/rest/v1/rental_rates',
        params={'id': f'eq.{rate_id}', 'select': FIELDS},
        headers={'Prefer': 'return=representation'}, json=prices,
    )
    response.raise_for_status()
    rows = response.json()
    return rows[0] if rows else None
