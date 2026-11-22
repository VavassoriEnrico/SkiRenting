from typing import Literal
from uuid import UUID

from fastapi import APIRouter

from app.api.routers.operator import CurrentUserId, SupabaseClient
from app.schemas.rental_booking import RentalBookingCreate, RentalBookingRead, RentalPaymentCreate
from app.services.rental_booking_service import confirm_booking, register_payment
from app.schemas.rental_history import HistoryBookingDetails, HistoryBookingRead, TodayReturnsRead, RentalReturnCreate
from app.services.rental_history_service import read_history, read_today_returns, register_return

router = APIRouter(prefix='/locations', tags=['rental-bookings'])


@router.post('/{location_id}/rental-bookings/{booking_id}/payments', response_model=HistoryBookingDetails)
def add_payment(location_id: UUID, booking_id: UUID, data: RentalPaymentCreate, user_id: CurrentUserId, client: SupabaseClient):
    return register_payment(client, user_id, location_id, booking_id, data)


@router.post('/{location_id}/rental-returns', response_model=HistoryBookingDetails)
def return_item(location_id: UUID, data: RentalReturnCreate, user_id: CurrentUserId, client: SupabaseClient):
    return register_return(client, user_id, location_id, data)


@router.get('/{location_id}/rental-returns', response_model=TodayReturnsRead)
def today_returns(location_id: UUID, user_id: CurrentUserId, client: SupabaseClient):
    return read_today_returns(client, user_id, location_id)


@router.get('/{location_id}/rental-bookings', response_model=list[HistoryBookingRead])
def list_bookings(
    location_id: UUID, user_id: CurrentUserId, client: SupabaseClient,
    scope: Literal['history', 'all'] = 'all',
):
    return read_history(client, user_id, location_id, history_only=scope == 'history')


@router.get('/{location_id}/rental-bookings/{booking_id}', response_model=HistoryBookingDetails)
def booking_details(location_id: UUID, booking_id: UUID, user_id: CurrentUserId, client: SupabaseClient):
    return read_history(client, user_id, location_id, history_only=False, booking_id=booking_id)


@router.post('/{location_id}/rental-bookings', response_model=RentalBookingRead, status_code=201)
def create_booking(
    location_id: UUID, data: RentalBookingCreate, user_id: CurrentUserId, client: SupabaseClient,
):
    return confirm_booking(client, user_id, location_id, data)
