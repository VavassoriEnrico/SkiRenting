from uuid import UUID

import httpx
from fastapi import HTTPException

from app.repositories import hotel_repository
from app.services.operator_service import get_operator_session


def database_error(error: httpx.HTTPError) -> HTTPException:
    if isinstance(error, httpx.HTTPStatusError):
        try:
            body = error.response.json()
        except ValueError:
            body = {}
        code = body.get('code') if isinstance(body, dict) else None
        if code in ('PGRST205', '42P01'):
            return HTTPException(503, 'Tabella alberghi non disponibile. Eseguire la query 007.')
        if code in ('42703', 'PGRST204'):
            return HTTPException(503, 'Colonna discount non disponibile. Eseguire la query 009.')
        if code == '23505':
            return HTTPException(409, 'Esiste già un albergo con questo nome.')
        if code == '42501':
            return HTTPException(403, 'Scrittura alberghi non abilitata. Verificare le query 008 e 009.')
    return HTTPException(503, 'Operazione sugli alberghi non riuscita. '
                             'Aggiorna l’elenco prima di riprovare.')


def list_hotels(client: httpx.Client, user_id: UUID):
    get_operator_session(client, user_id)
    try:
        return hotel_repository.list_hotels(client)
    except httpx.HTTPError as error:
        raise database_error(error) from error


def create_hotel(client: httpx.Client, user_id: UUID, name: str, discount: float = 0):
    get_operator_session(client, user_id)
    try:
        for hotel in hotel_repository.list_hotels(client, include_inactive=True):
            if hotel['name'].strip().casefold() == name.casefold():
                if hotel['is_active']:
                    raise HTTPException(409, 'Esiste già un albergo con questo nome.')
                restored = hotel_repository.set_active(client, UUID(hotel['id']), True, discount)
                if restored is None:
                    raise HTTPException(404, 'Albergo non trovato. Aggiorna l’elenco.')
                return restored
        return hotel_repository.create_hotel(client, name, discount)
    except httpx.HTTPError as error:
        raise database_error(error) from error


def remove_hotel(client: httpx.Client, user_id: UUID, hotel_id: UUID):
    get_operator_session(client, user_id)
    try:
        if hotel_repository.set_active(client, hotel_id, False) is None:
            raise HTTPException(404, 'Albergo non trovato. Aggiorna l’elenco.')
    except httpx.HTTPError as error:
        raise database_error(error) from error


def update_discount(client: httpx.Client, user_id: UUID, hotel_id: UUID, discount: float):
    get_operator_session(client, user_id)
    try:
        hotel = hotel_repository.update_discount(client, hotel_id, discount)
        if hotel is None:
            raise HTTPException(404, 'Albergo non trovato o rimosso. Aggiorna l’elenco.')
        return hotel
    except httpx.HTTPError as error:
        raise database_error(error) from error
