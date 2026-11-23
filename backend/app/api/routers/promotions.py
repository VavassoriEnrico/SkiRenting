from uuid import UUID

from fastapi import APIRouter, Response

from app.api.routers.operator import CurrentUserId, SupabaseClient
from app.schemas.promotion import PromotionCreate, PromotionRead
from app.services import promotion_service

router = APIRouter(prefix='/promotions', tags=['promotions'])


@router.get('', response_model=list[PromotionRead])
def list_promotions(user_id: CurrentUserId, client: SupabaseClient):
    return promotion_service.list_promotions(client, user_id)


@router.post('', response_model=PromotionRead, status_code=201)
def create(data: PromotionCreate, user_id: CurrentUserId, client: SupabaseClient):
    return promotion_service.create(client, user_id, data)


@router.delete('/{promotion_id}', status_code=204)
def remove(promotion_id: UUID, user_id: CurrentUserId, client: SupabaseClient):
    promotion_service.remove(client, user_id, promotion_id)
    return Response(status_code=204)
