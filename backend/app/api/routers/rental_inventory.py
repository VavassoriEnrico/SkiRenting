from datetime import date
from uuid import UUID

from fastapi import APIRouter

from app.api.routers.operator import CurrentUserId, SupabaseClient
from app.schemas.inventory_transfer import InventoryTransferCreate, InventoryTransferRead
from app.schemas.rental_inventory import (
    RentalCatalogRead,
    RentalInventoryRead,
    RentalItemCreate,
    RentalItemCreated,
    RentalItemsArchive,
    RentalItemsArchived,
    RentalArrivalCreate,
    RentalArrivalRead,
)
from app.services import rental_inventory_service
from app.schemas.rental_item_details import RentalItemDetailsRead
from app.services.rental_item_details_service import get_item_details

router = APIRouter(prefix="/locations", tags=["rental-inventory"])


@router.get("/{location_id}/rental-inventory", response_model=RentalInventoryRead)
def read_inventory(
    location_id: UUID, user_id: CurrentUserId, client: SupabaseClient,
    available_only: bool = False, starts_on: date | None = None, ends_on: date | None = None,
):
    return rental_inventory_service.get_inventory(client, user_id, location_id, available_only, starts_on, ends_on)


@router.get('/{location_id}/rental-catalog', response_model=RentalCatalogRead)
def read_catalog(location_id: UUID, user_id: CurrentUserId, client: SupabaseClient):
    return rental_inventory_service.get_catalog(client, user_id, location_id)


@router.post('/{location_id}/rental-inventory', response_model=RentalItemCreated, status_code=201)
def create_item(
    location_id: UUID, data: RentalItemCreate, user_id: CurrentUserId, client: SupabaseClient,
):
    return rental_inventory_service.create_item(client, user_id, location_id, data)


@router.post('/{location_id}/rental-inventory/{item_id}/transfer', response_model=InventoryTransferRead)
def transfer_item(
    location_id: UUID, item_id: UUID, data: InventoryTransferCreate,
    user_id: CurrentUserId, client: SupabaseClient,
):
    return rental_inventory_service.transfer_item(
        client, user_id, item_id, location_id, data.destination_location_id,
    )


@router.get('/{location_id}/rental-inventory/{item_id}', response_model=RentalItemDetailsRead)
def read_item_details(location_id: UUID, item_id: UUID, user_id: CurrentUserId, client: SupabaseClient):
    return get_item_details(client, user_id, location_id, item_id)


@router.post('/{location_id}/rental-inventory/archive', response_model=RentalItemsArchived)
def archive_items(location_id: UUID, data: RentalItemsArchive, user_id: CurrentUserId, client: SupabaseClient):
    return rental_inventory_service.archive_items(client, user_id, location_id, data.item_ids)


@router.post('/{location_id}/rental-arrivals', response_model=RentalArrivalRead, status_code=201)
def register_arrival(location_id: UUID, data: RentalArrivalCreate, user_id: CurrentUserId, client: SupabaseClient):
    return rental_inventory_service.register_arrival(client, user_id, location_id, data)


@router.get('/{location_id}/retired-rental-inventory/{item_id}', response_model=RentalItemDetailsRead)
def read_retired_item_details(location_id: UUID, item_id: UUID, user_id: CurrentUserId, client: SupabaseClient):
    return get_item_details(client, user_id, location_id, item_id, retired_only=True)
