from uuid import UUID

import httpx
from fastapi import HTTPException

from app.repositories import rental_inventory_repository, sale_inventory_repository
from app.services.operator_service import get_operator_session


def get_general_sale_inventory(client: httpx.Client, user_id: UUID):
    operator = get_operator_session(client, user_id)
    try:
        return {
            'categories': rental_inventory_repository.list_categories(client),
            'locations': operator.locations,
            'items': sale_inventory_repository.list_stock_for_locations(
                client, [str(location.id) for location in operator.locations],
            ),
        }
    except httpx.HTTPError as error:
        raise HTTPException(503, 'Impossibile caricare il magazzino generale vendite da Supabase.') from error
