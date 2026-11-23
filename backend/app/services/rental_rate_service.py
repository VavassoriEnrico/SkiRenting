from uuid import UUID

import httpx
from fastapi import HTTPException

from app.repositories import rental_rate_repository
from app.schemas.rental_rate import RentalRateUpdate
from app.services.operator_service import get_operator_session


def database_error(error: httpx.HTTPError) -> HTTPException:
    if isinstance(error, httpx.HTTPStatusError):
        try:
            body = error.response.json()
        except ValueError:
            body = {}
        code = body.get('code') if isinstance(body, dict) else None
        if code in ('PGRST205', '42P01', '42703', 'PGRST204'):
            return HTTPException(503, 'Listino non disponibile. Verifica 010_rental_rates.sql e 027_daily_pack_rates.sql in Supabase.')
        if code == '42501':
            return HTTPException(403, 'Modifica tariffe non autorizzata. Verificare la query 010.')
        if code in ('23514', '22003'):
            return HTTPException(422, 'Inserisci prezzi validi maggiori o uguali a zero. Le tariffe pack sono previste solo per sci e snowboard.')
    return HTTPException(503, 'Operazione sulle tariffe non riuscita. '
                             'Verifica il listino prima di riprovare.')


def list_rates(client: httpx.Client, user_id: UUID):
    get_operator_session(client, user_id)
    try:
        return rental_rate_repository.list_rates(client)
    except httpx.HTTPError as error:
        raise database_error(error) from error


def update_rate(client: httpx.Client, user_id: UUID, rate_id: UUID, data: RentalRateUpdate):
    get_operator_session(client, user_id)
    try:
        result = rental_rate_repository.update_rate(client, rate_id, data.model_dump(exclude_unset=True))
        if result is None:
            raise HTTPException(404, 'Tariffa non trovata. Aggiorna il listino.')
        return result
    except httpx.HTTPError as error:
        raise database_error(error) from error
