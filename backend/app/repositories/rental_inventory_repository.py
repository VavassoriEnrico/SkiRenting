from uuid import UUID

import httpx

VARIANT_SELECT = (
    "id,brand,model,year,notes,category:material_categories(id,code,name),"
    "ski_details(length_cm,radius_m,style),snowboard_details(length_cm,radius_m,style),"
    "boot_details(size_label,size_system,shoe_size_eu,foot_length_cm,sole_length_mm),"
    "helmet_details(size_label,color),pole_details(height_cm),goggle_details(lens),"
    "accessory_details(size_label)"
)
ITEM_SELECT = (
    "id,code,serial_number,purchase_price,legacy_sold_price,status,is_rentable,is_bookable,notes,"
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
        "select": ITEM_SELECT, "location_id": f"eq.{location_id}", "order": "id",
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
