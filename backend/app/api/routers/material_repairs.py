from uuid import UUID
from fastapi import APIRouter
from app.api.routers.operator import CurrentUserId, SupabaseClient
from app.schemas.material_repair import RepairCreate, RepairComplete, RepairCreated, RepairRead
from app.schemas.rental_inventory import RentalItemRead
from app.services import material_repair_service as service

router = APIRouter(prefix='/locations',tags=['repairs'])


@router.get('/{location_id}/repairs',response_model=list[RepairRead])
def list_repairs(location_id:UUID,user_id:CurrentUserId,client:SupabaseClient):
    return service.list_repairs(client,user_id,location_id)


@router.post('/{location_id}/repairs',response_model=RepairCreated,status_code=201)
def create_repair(location_id:UUID,data:RepairCreate,user_id:CurrentUserId,client:SupabaseClient):
    return service.create_repair(client,user_id,location_id,data)


@router.post('/{location_id}/repairs/{repair_id}/complete',response_model=RentalItemRead)
def complete_repair(location_id:UUID,repair_id:UUID,data:RepairComplete,user_id:CurrentUserId,client:SupabaseClient):
    return service.complete_repair(client,user_id,location_id,repair_id,data.rental_inventory_id)
