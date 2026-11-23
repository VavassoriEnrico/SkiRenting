from uuid import UUID
from fastapi import APIRouter

from app.api.routers.operator import CurrentUserId, SupabaseClient
from app.repositories import seasonal_repository
from app.schemas.seasonal import SeasonalSettings, SeasonRead, SeasonSave, SeasonalRateList, SeasonalRate, SeasonalPriceUpdate, SeasonalQuoteRequest, SeasonalQuoteRead, SeasonalBookingCreate, SeasonalBookingRead
from app.schemas.rental_history import HistoryBookingRead
from app.services import seasonal_service

router=APIRouter(tags=['seasonal-rentals'])


@router.get('/seasonal-rentals/settings',response_model=SeasonalSettings)
def settings(user_id:CurrentUserId,client:SupabaseClient):
    return seasonal_service.management(client,user_id,seasonal_repository.settings)


@router.post('/seasonal-rentals/settings',response_model=SeasonRead)
def save_settings(data:SeasonSave,user_id:CurrentUserId,client:SupabaseClient):
    return seasonal_service.management(client,user_id,seasonal_repository.save_season,data)


@router.get('/seasonal-rates',response_model=SeasonalRateList)
def rates(user_id:CurrentUserId,client:SupabaseClient):
    return seasonal_service.management(client,user_id,seasonal_repository.rates)


@router.patch('/seasonal-rates/{rate_id}',response_model=SeasonalRate)
def update_rate(rate_id:UUID,data:SeasonalPriceUpdate,user_id:CurrentUserId,client:SupabaseClient):
    return seasonal_service.management(client,user_id,seasonal_repository.update_rate,rate_id,data)


@router.post('/locations/{location_id}/seasonal-quote',response_model=SeasonalQuoteRead)
def quote(location_id:UUID,data:SeasonalQuoteRequest,user_id:CurrentUserId,client:SupabaseClient):
    return seasonal_service.quote(client,user_id,location_id,data)


@router.post('/locations/{location_id}/seasonal-bookings',response_model=SeasonalBookingRead,status_code=201)
def confirm(location_id:UUID,data:SeasonalBookingCreate,user_id:CurrentUserId,client:SupabaseClient):
    return seasonal_service.confirm(client,user_id,location_id,data)


@router.get('/locations/{location_id}/seasonal-bookings',response_model=list[HistoryBookingRead])
def bookings(location_id:UUID,season_id:UUID,user_id:CurrentUserId,client:SupabaseClient):
    return seasonal_service.list_bookings(client,user_id,location_id,season_id)
