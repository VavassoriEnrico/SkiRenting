from uuid import UUID

from fastapi import APIRouter

from app.api.routers.operator import CurrentUserId, SupabaseClient
from app.schemas.rental_quote import RentalQuoteRead, RentalQuoteRequest
from app.services.rental_quote_service import get_quote

router = APIRouter(prefix='/locations', tags=['rental-quote'])


@router.post('/{location_id}/rental-quote', response_model=RentalQuoteRead)
def rental_quote(
    location_id: UUID, data: RentalQuoteRequest, user_id: CurrentUserId, client: SupabaseClient,
):
    return get_quote(client, user_id, location_id, data)
