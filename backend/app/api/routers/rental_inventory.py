from uuid import UUID

from fastapi import APIRouter

from app.api.routers.operator import CurrentUserId, SupabaseClient
from app.schemas.rental_inventory import (
    RentalCatalogRead,
    RentalInventoryRead,
    RentalItemCreate,
    RentalItemCreated,
)
from app.services import rental_inventory_service

router = APIRouter(prefix="/locations", tags=["rental-inventory"])


@router.get("/{location_id}/rental-inventory", response_model=RentalInventoryRead)
def read_inventory(location_id: UUID, user_id: CurrentUserId, client: SupabaseClient):
    return rental_inventory_service.get_inventory(client, user_id, location_id)


@router.get('/{location_id}/rental-catalog', response_model=RentalCatalogRead)
def read_catalog(location_id: UUID, user_id: CurrentUserId, client: SupabaseClient):
    return rental_inventory_service.get_catalog(client, user_id, location_id)


@router.post('/{location_id}/rental-inventory', response_model=RentalItemCreated, status_code=201)
def create_item(
    location_id: UUID, data: RentalItemCreate, user_id: CurrentUserId, client: SupabaseClient,
):
    return rental_inventory_service.create_item(client, user_id, location_id, data)
