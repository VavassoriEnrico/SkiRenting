from fastapi import APIRouter

from app.api.routers.operator import CurrentUserId, SupabaseClient
from app.schemas.rental_inventory import GeneralRentalInventoryRead
from app.services.rental_inventory_service import get_general_inventory

router = APIRouter(tags=['rental-inventory'])


@router.get('/rental-inventory',response_model=GeneralRentalInventoryRead)
def general_inventory(user_id:CurrentUserId,client:SupabaseClient):
    return get_general_inventory(client,user_id)
