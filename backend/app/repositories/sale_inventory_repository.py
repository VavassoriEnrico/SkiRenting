import httpx

from app.repositories.rental_inventory_repository import VARIANT_SELECT, read_all


def list_stock_for_locations(client: httpx.Client, location_ids: list[str]) -> list[dict]:
    stock = []
    for start in range(0, len(location_ids), 100):
        identifiers = ','.join(location_ids[start:start + 100])
        stock.extend(read_all(client, 'sale_inventory', {
            'select': f'id,quantity,price,notes,location:locations(id,name),variant:material_variants({VARIANT_SELECT})',
            'location_id': f'in.({identifiers})',
            'quantity': 'gt.0',
            'order': 'id',
        }))
    return stock
