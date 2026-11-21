from uuid import UUID

from fastapi import APIRouter, Response

from app.api.routers.operator import CurrentUserId, SupabaseClient
from app.schemas.hotel import HotelCreate, HotelDiscountUpdate, HotelRead
from app.services import hotel_service

router = APIRouter(prefix='/hotels', tags=['hotels'])


@router.get('', response_model=list[HotelRead])
def read_hotels(user_id: CurrentUserId, client: SupabaseClient):
    return hotel_service.list_hotels(client, user_id)


@router.post('', response_model=HotelRead, status_code=201)
def create_hotel(data: HotelCreate, user_id: CurrentUserId, client: SupabaseClient):
    return hotel_service.create_hotel(client, user_id, data.name, data.discount)


@router.patch('/{hotel_id}', response_model=HotelRead)
def update_discount(
    hotel_id: UUID, data: HotelDiscountUpdate, user_id: CurrentUserId, client: SupabaseClient,
):
    return hotel_service.update_discount(client, user_id, hotel_id, data.discount)


@router.delete('/{hotel_id}', status_code=204)
def remove_hotel(hotel_id: UUID, user_id: CurrentUserId, client: SupabaseClient):
    hotel_service.remove_hotel(client, user_id, hotel_id)
    return Response(status_code=204)
