from uuid import UUID

import httpx
from fastapi import HTTPException

from app.repositories import rental_history_repository, seasonal_repository
from app.repositories.rental_inventory_repository import read_all
from app.services.operator_service import get_authorized_location, get_operator_session
from app.services.rental_booking_service import payment_payload
from app.services.rental_history_service import enrich


def seasonal_error(error: httpx.HTTPError):
    if isinstance(error,httpx.HTTPStatusError):
        try:
            body=error.response.json()
        except ValueError:
            body={}
        code=body.get('code') if isinstance(body,dict) else None
        if code in ('PGRST205','PGRST202','42P01','42703','PGRST204'):
            return HTTPException(503,'Esegui 023_seasonal_rentals.sql in Supabase per configurare gli stagionali.')
        if code=='42501': return HTTPException(403,'Operazione stagionale non autorizzata.')
        if code=='23505': return HTTPException(409,'Esiste già una stagione con questo nome.')
        if code=='P0002': return HTTPException(404,'Stagione o tariffa non trovata.')
        if code=='P0001': return HTTPException(409,body.get('message','Dati stagionali cambiati. Aggiorna il modulo.'))
        if code in ('22023','22007','22008','22P02','22003','23514','23503'):
            return HTTPException(422,body.get('message','Controlla stagione, prezzi e composizione del pack.'))
    return HTTPException(503,'Operazione stagionale non riuscita. Verifica i dati salvati prima di riprovare.')


def management(client: httpx.Client, user_id: UUID, operation, *args):
    get_operator_session(client,user_id)
    try:
        result=operation(client,*args)
        if result is None: raise HTTPException(404,'Tariffa stagionale non trovata.')
        return result
    except httpx.HTTPError as error:
        raise seasonal_error(error) from error


def quote(client: httpx.Client, user_id: UUID, location_id: UUID, data):
    get_authorized_location(client,user_id,location_id)
    try:
        return seasonal_repository.quote(client,location_id,data)
    except httpx.HTTPError as error:
        raise seasonal_error(error) from error


def confirm(client: httpx.Client, user_id: UUID, location_id: UUID, data):
    get_authorized_location(client,user_id,location_id)
    payload=data.model_dump(mode='json',exclude={'booking_id'})
    if data.pole_quantity == 1:
        payload.pop('pole_quantity')
    if data.payment: payload['payment']=payment_payload(data.payment)
    try:
        return seasonal_repository.confirm(client,location_id,data.booking_id,payload)
    except httpx.HTTPError as error:
        raise seasonal_error(error) from error


def list_bookings(client: httpx.Client, user_id: UUID, location_id: UUID, season_id: UUID):
    get_authorized_location(client,user_id,location_id)
    try:
        headers=read_all(client,'rental_bookings',{
            'select':rental_history_repository.HEADER_FIELDS,'location_id':f'eq.{location_id}',
            'rental_kind':'eq.seasonal','season_id':f'eq.{season_id}','order':'starts_on.desc,booking_number.desc,id',
        })
        items,payments=rental_history_repository.get_children(client,headers)
        return enrich(headers,items,payments,details=False)
    except httpx.HTTPError as error:
        raise seasonal_error(error) from error
