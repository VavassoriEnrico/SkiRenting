from fastapi import APIRouter

from app.api.routers.operator import CurrentUserId, SupabaseClient
from app.schemas.rental_inventory import GeneralRentalInventoryRead
from app.services.rental_inventory_service import get_general_inventory

from app.schemas.sale_inventory import GeneralSaleInventoryRead
from app.services.sale_inventory_service import get_general_sale_inventory

router = APIRouter(tags=['rental-inventory'])


@router.get('/rental-inventory',response_model=GeneralRentalInventoryRead)
def general_inventory(user_id:CurrentUserId,client:SupabaseClient):
    return get_general_inventory(client,user_id)


@router.get('/sale-inventory', response_model=GeneralSaleInventoryRead, tags=['sale-inventory'])
def general_sale_inventory(user_id: CurrentUserId, client: SupabaseClient):
    return get_general_sale_inventory(client, user_id)
