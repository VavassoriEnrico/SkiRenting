from datetime import date
from uuid import UUID

import httpx

VARIANT_SELECT = (
    "id,brand,model,year,category:material_categories(id,code,name),"
    "ski_details(length_cm),snowboard_details(length_cm),"
    "boot_details(size_label),"
    "helmet_details(size_label),pole_details(height_cm),goggle_details(lens),"
    "accessory_details(size_label)"
)
ITEM_SELECT = (
    "id,code,serial_number,purchase_price,legacy_sold_price,status,is_rentable,is_bookable,is_generic,notes,"
    "group:material_groups(id,name),"
    f"variant:material_variants({VARIANT_SELECT})"
)


def read_all(client: httpx.Client, table: str, params: dict) -> list[dict]:
    # Small pages also work with projects whose REST row limit is below 1000.
    rows = []
    offset = 0
    while True:
        response = client.get(
            f"/rest/v1/{table}",
            params={**params, "limit": "500", "offset": str(offset)},
        )
        response.raise_for_status()
        page = response.json()
        if not page:
            return rows
        rows.extend(page)
        offset += len(page)


def list_categories(client: httpx.Client) -> list[dict]:
    return read_all(client, "material_categories", {"select": "id,code,name", "order": "name,id"})


def list_items(client: httpx.Client, location_id: UUID) -> list[dict]:
    return read_all(client, "rental_inventory", {
        "select": ITEM_SELECT, "location_id": f"eq.{location_id}", "deleted_at": "is.null", "status": "neq.retired", "order": "id",
    })


def get_catalog(client: httpx.Client) -> dict:
    # Scegliere anche varianti non ancora assegnate alla sede corrente.
    return {
        "categories": read_all(client, "material_categories", {
            "select": "id,code,name,detail_type", "order": "name,id",
        }),
        "groups": read_all(client, "material_groups", {
            "select": "id,category_id,name", "is_active": "eq.true", "order": "name,id",
        }),
        "variants": read_all(client, "material_variants", {
            "select": VARIANT_SELECT, "is_active": "eq.true", "order": "brand,model,id",
        }),
    }


def create_item(client: httpx.Client, location_id: UUID, data: dict) -> dict:
    response = client.post('/rest/v1/rpc/skirenting_create_rental_item', json={
        "p_location_id": str(location_id), "p_data": data,
    })
    response.raise_for_status()
    return response.json()


def transfer_item(client: httpx.Client, item_id: UUID, source: UUID, destination: UUID) -> dict:
    response = client.post('/rest/v1/rpc/skirenting_transfer_rental_item', json={
        'p_item_id': str(item_id), 'p_source_location_id': str(source),
        'p_target_location_id': str(destination),
    })
    response.raise_for_status()
    return response.json()


def unavailable_item_ids(client: httpx.Client, items: list[dict], starts_on: date, ends_on: date) -> set[str]:
    items = [item for item in items if not item.get('is_generic', False)]
    blocked = set()
    for start in range(0, len(items), 100):
        identifiers = ','.join(str(item['id']) for item in items[start:start + 100])
        rows = read_all(client, 'rental_booking_items', {
            'select': 'id,rental_inventory_id,delivered_at,booking:rental_bookings!inner(status,starts_on,ends_on)',
            'booking.deleted_at': 'is.null',
            'rental_inventory_id': f'in.({identifiers})', 'returned_at': 'is.null', 'order': 'id',
        })
        for row in rows:
            booking = row['booking']
            overlaps = booking['starts_on'] <= ends_on.isoformat() and booking['ends_on'] >= starts_on.isoformat()
            if row['delivered_at'] or booking['status'] == 'active' or (
                booking['status'] in ('confirmed', 'preparing') and overlaps
            ):
                blocked.add(row['rental_inventory_id'])
    return blocked


def list_generic_items(client: httpx.Client) -> list[dict]:
    return read_all(client, 'rental_inventory', {
        'select': ITEM_SELECT, 'is_generic': 'eq.true', 'deleted_at': 'is.null', 'status': 'neq.retired', 'order': 'id',
    })


def list_items_for_locations(client: httpx.Client, location_ids: list[str]) -> list[dict]:
    items = []
    for start in range(0,len(location_ids),100):
        identifiers = ','.join(location_ids[start:start+100])
        items.extend(read_all(client,'rental_inventory',{
            'select': f'{ITEM_SELECT},location:locations(id,name)',
            'location_id': f'in.({identifiers})', 'deleted_at': 'is.null', 'status': 'neq.retired', 'order': 'id',
        }))
    return items


def archive_items(client: httpx.Client, location_id: UUID, item_ids: list[UUID]) -> dict:
    response = client.post('/rest/v1/rpc/skirenting_archive_rental_items', json={
        'p_location_id': str(location_id), 'p_item_ids': [str(item_id) for item_id in item_ids],
    })
    response.raise_for_status()
    return response.json()


def register_arrival(client: httpx.Client, location_id: UUID, data: dict) -> dict:
    shared = dict(data)
    request_id = shared.pop('request_id')
    units = shared.pop('units')
    response = client.post('/rest/v1/rpc/skirenting_register_rental_arrival', json={
        'p_location_id': str(location_id), 'p_request_id': request_id, 'p_data': shared, 'p_units': units,
    })
    response.raise_for_status()
    return response.json()


def list_retired_items(client: httpx.Client, location_ids: list[str]) -> list[dict]:
    items = []
    for start in range(0, len(location_ids), 100):
        identifiers = ','.join(location_ids[start:start + 100])
        items.extend(read_all(client, 'rental_inventory', {
            'select': f'{ITEM_SELECT},deleted_at,deleted_by,location:locations(id,name)',
            'location_id': f'in.({identifiers})', 'or': '(deleted_at.not.is.null,status.eq.retired)',
            'order': 'id',
        }))
    return items


def reactivate_item(client: httpx.Client, location_id: UUID, item_id: UUID) -> dict:
    response = client.post('/rest/v1/rpc/skirenting_reactivate_rental_item', json={
        'p_location_id': str(location_id), 'p_item_id': str(item_id),
    })
    response.raise_for_status()
    return response.json()
