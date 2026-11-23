from uuid import UUID

import httpx

from app.repositories.rental_inventory_repository import read_all

SEASON_FIELDS = 'id,name,return_date,is_current,created_at'
RATE_FIELDS = 'id,group_id,single_price,pack_price,group:material_groups(id,name,category:material_categories(id,code,name))'


def settings(client: httpx.Client):
    seasons = read_all(client,'rental_seasons',{'select':SEASON_FIELDS,'order':'return_date.desc,id'})
    return {'seasons':seasons,'current_season':next((season for season in seasons if season['is_current']),None)}


def rates(client: httpx.Client):
    return {'rates':read_all(client,'seasonal_rates',{
        'select':RATE_FIELDS.replace('group:material_groups(', 'group:material_groups!inner('),
        'group.is_active':'eq.true','order':'id',
    })}


def save_season(client: httpx.Client, data):
    response=client.post('/rest/v1/rpc/skirenting_save_rental_season',json={
        'p_id':str(data.id) if data.id else None,'p_name':data.name,'p_return_date':data.return_date.isoformat(),
    })
    response.raise_for_status()
    return response.json()


def update_rate(client: httpx.Client, rate_id: UUID, data):
    response=client.patch('/rest/v1/seasonal_rates',params={'id':f'eq.{rate_id}','select':RATE_FIELDS},
        headers={'Prefer':'return=representation'},json=data.model_dump(mode='json'))
    response.raise_for_status()
    rows=response.json()
    return rows[0] if rows else None


def quote(client: httpx.Client, location_id: UUID, data):
    response=client.post('/rest/v1/rpc/skirenting_seasonal_quote',json={'p_location_id':str(location_id),'p_data':data.model_dump(mode='json')})
    response.raise_for_status()
    return response.json()


def confirm(client: httpx.Client, location_id: UUID, booking_id: UUID, data: dict):
    response=client.post('/rest/v1/rpc/skirenting_confirm_seasonal_rental',json={
        'p_location_id':str(location_id),'p_booking_id':str(booking_id),'p_data':data,
    })
    response.raise_for_status()
    return response.json()
