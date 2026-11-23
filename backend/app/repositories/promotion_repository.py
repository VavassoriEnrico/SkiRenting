from uuid import UUID

import httpx

from app.repositories.rental_inventory_repository import read_all
from app.schemas.promotion import PromotionCreate

FIELDS = 'id,name,created_at,promotion_date,starts_on,ends_on,weekdays,discount_percent,is_active'


def list_promotions(client: httpx.Client):
    return read_all(client, 'promotions', {
        'select': FIELDS, 'is_active': 'eq.true', 'order': 'created_at.desc,id',
    })


def create(client: httpx.Client, data: PromotionCreate):
    response = client.post('/rest/v1/promotions', params={'select': FIELDS},
                           headers={'Prefer': 'return=representation'}, json=data.model_dump(mode='json'))
    response.raise_for_status()
    return response.json()[0]


def remove(client: httpx.Client, promotion_id: UUID):
    response = client.patch('/rest/v1/promotions',
                            params={'select': FIELDS, 'id': f'eq.{promotion_id}', 'is_active': 'eq.true'},
                            headers={'Prefer': 'return=representation'}, json={'is_active': False})
    response.raise_for_status()
    return bool(response.json())
