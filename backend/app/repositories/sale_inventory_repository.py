from uuid import UUID

import httpx

from app.repositories.rental_inventory_repository import VARIANT_SELECT, read_all


def list_stock_for_locations(client: httpx.Client, location_ids: list[str]) -> list[dict]:
    stock = []
    for start in range(0, len(location_ids), 100):
        identifiers = ','.join(location_ids[start:start + 100])
        stock.extend(read_all(client, 'sale_inventory', {
            'select': f'id,quantity,price,notes,location:locations(id,name),variant:material_variants({VARIANT_SELECT},sale_details:sale_variant_details(category_label))',
            'location_id': f'in.({identifiers})',
            'quantity': 'gt.0', 'deleted_at': 'is.null',
            'order': 'id',
        }))
    return stock


def get_catalog(client: httpx.Client) -> dict:
    return {
        'categories': read_all(client, 'material_categories', {
            'select': 'id,code,name,detail_type', 'order': 'name,id',
        }),
        'variants': read_all(client, 'material_variants', {
            'select': f'{VARIANT_SELECT},sale_details:sale_variant_details(category_label)',
            'is_active': 'eq.true', 'order': 'brand,model,id',
        }),
    }


def register_arrival(client: httpx.Client, location_id: UUID, data: dict) -> dict:
    body = dict(data)
    request_id = body.pop('request_id')
    response = client.post('/rest/v1/rpc/skirenting_register_sale_arrival', json={
        'p_location_id': str(location_id), 'p_request_id': request_id, 'p_data': body,
    })
    response.raise_for_status()
    return response.json()


def archive_stock(client: httpx.Client, location_id: UUID, inventory_id: UUID):
    response = client.post('/rest/v1/rpc/skirenting_archive_sale_stock', json={
        'p_location_id': str(location_id), 'p_inventory_id': str(inventory_id),
    })
    response.raise_for_status()
