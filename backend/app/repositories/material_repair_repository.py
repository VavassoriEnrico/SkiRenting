from uuid import UUID

import httpx
from app.repositories.rental_inventory_repository import ITEM_SELECT, read_all


def list_open(client: httpx.Client, location_id: UUID):
    return read_all(client,'material_repairs',{
        'select':f'id,rental_inventory_id,repair_type,sent_at,notes,item:rental_inventory!inner({ITEM_SELECT})',
        'status':'eq.in_progress','item.location_id':f'eq.{location_id}','order':'sent_at,id',
    })


def open_for_items(client: httpx.Client, items: list[dict]):
    result = {}
    for start in range(0,len(items),100):
        ids = ','.join(str(item['id']) for item in items[start:start+100])
        rows = read_all(client,'material_repairs',{
            'select':'id,rental_inventory_id,repair_type,sent_at', 'status':'eq.in_progress',
            'rental_inventory_id':f'in.({ids})','order':'id',
        })
        result.update({row['rental_inventory_id']:row for row in rows})
    return result


def create(client: httpx.Client, location_id: UUID, data):
    response = client.post('/rest/v1/rpc/skirenting_create_material_repair',json={
        'p_location_id':str(location_id),'p_repair_id':str(data.repair_id),'p_code':data.code,
        'p_repair_type':data.repair_type,'p_notes':data.notes,
    })
    response.raise_for_status()
    return response.json()


def complete(client: httpx.Client, location_id: UUID, repair_id: UUID, item_id: UUID):
    response = client.post('/rest/v1/rpc/skirenting_complete_material_repair',json={
        'p_location_id':str(location_id),'p_repair_id':str(repair_id),'p_item_id':str(item_id),
    })
    response.raise_for_status()
    return response.json()


def get_item(client: httpx.Client, location_id: UUID, item_id: UUID):
    rows = read_all(client,'rental_inventory',{
        'select':ITEM_SELECT,'location_id':f'eq.{location_id}','id':f'eq.{item_id}','order':'id',
    })
    return rows[0] if rows else None
