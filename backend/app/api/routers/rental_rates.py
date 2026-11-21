from uuid import UUID

from fastapi import APIRouter

from app.api.routers.operator import CurrentUserId, SupabaseClient
from app.schemas.rental_rate import RentalRateList, RentalRateRead, RentalRateUpdate
from app.services import rental_rate_service

router = APIRouter(prefix='/rental-rates', tags=['rental-rates'])


@router.get('', response_model=RentalRateList)
def list_rates(user_id: CurrentUserId, client: SupabaseClient):
    return rental_rate_service.list_rates(client, user_id)


@router.patch('/{rate_id}', response_model=RentalRateRead)
def update_rate(
    rate_id: UUID, data: RentalRateUpdate, user_id: CurrentUserId, client: SupabaseClient,
):
    return rental_rate_service.update_rate(client, user_id, rate_id, data)
