from uuid import UUID

from fastapi import APIRouter, Response

from app.api.routers.operator import CurrentUserId, SupabaseClient
from app.schemas.sale_inventory import GeneralSaleInventoryRead, SaleCatalogRead, SaleArrivalCreate, SaleArrivalRead
from app.services import sale_inventory_service

router = APIRouter(prefix='/locations', tags=['sale-inventory'])


@router.get('/{location_id}/sale-inventory', response_model=GeneralSaleInventoryRead)
def inventory(location_id: UUID, user_id: CurrentUserId, client: SupabaseClient):
    return sale_inventory_service.get_inventory(client, user_id, location_id)


@router.get('/{location_id}/sale-catalog', response_model=SaleCatalogRead)
def catalog(location_id: UUID, user_id: CurrentUserId, client: SupabaseClient):
    return sale_inventory_service.get_catalog(client, user_id, location_id)


@router.post('/{location_id}/sale-arrivals', response_model=SaleArrivalRead, status_code=201)
def arrival(location_id: UUID, data: SaleArrivalCreate, user_id: CurrentUserId, client: SupabaseClient):
    return sale_inventory_service.register_arrival(client, user_id, location_id, data)


@router.delete('/{location_id}/sale-inventory/{inventory_id}', status_code=204)
def archive_stock(location_id: UUID, inventory_id: UUID, user_id: CurrentUserId, client: SupabaseClient):
    sale_inventory_service.archive_stock(client, user_id, location_id, inventory_id)
    return Response(status_code=204)
