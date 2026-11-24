from uuid import UUID

import httpx
from fastapi import HTTPException

from app.repositories import rental_inventory_repository, sale_inventory_repository
from app.services.operator_service import get_operator_session, get_authorized_location
from app.schemas.sale_inventory import SaleArrivalCreate


def get_general_sale_inventory(client: httpx.Client, user_id: UUID):
    operator = get_operator_session(client, user_id)
    try:
        return {
            'categories': rental_inventory_repository.list_categories(client),
            'locations': operator.locations,
            'items': sale_inventory_repository.list_stock_for_locations(
                client, [str(location.id) for location in operator.locations],
            ),
        }
    except httpx.HTTPError as error:
        raise sale_inventory_error(error) from error


def get_inventory(client: httpx.Client, user_id: UUID, location_id: UUID):
    location = get_authorized_location(client, user_id, location_id)
    try:
        return {
            'categories': rental_inventory_repository.list_categories(client),
            'locations': [location],
            'items': sale_inventory_repository.list_stock_for_locations(client, [str(location_id)]),
        }
    except httpx.HTTPError as error:
        raise sale_inventory_error(error) from error


def get_catalog(client: httpx.Client, user_id: UUID, location_id: UUID):
    get_authorized_location(client, user_id, location_id)
    try:
        return sale_inventory_repository.get_catalog(client)
    except httpx.HTTPError as error:
        raise sale_inventory_error(error) from error


def register_arrival(client: httpx.Client, user_id: UUID, location_id: UUID, data: SaleArrivalCreate):
    get_authorized_location(client, user_id, location_id)
    try:
        return sale_inventory_repository.register_arrival(client, location_id,
            data.model_dump(mode='json', exclude_none=True))
    except httpx.HTTPError as error:
        raise sale_inventory_error(error) from error


def sale_inventory_error(error: httpx.HTTPError):
    if isinstance(error, httpx.HTTPStatusError):
        try:
            code = error.response.json().get('code')
        except (ValueError, AttributeError):
            code = None
        if code in ('PGRST202', 'PGRST204', 'PGRST205', '42703', '42P01'):
            return HTTPException(503, 'Eseguire 031_sale_stock_arrivals.sql in Supabase.')
        if code == '42501' or error.response.status_code in (401, 403):
            return HTTPException(403, 'Non sei autorizzato a gestire il magazzino vendite di questa sede.')
        if code == 'P0002':
            return HTTPException(404, 'Articolo non trovato nel magazzino di questa sede.')
        if code == '23505':
            return HTTPException(409, 'Questo arrivo è già stato utilizzato con dati diversi. Riapri il modulo per registrare un altro arrivo.')
        if code in ('23514', '23502', '23503', '22023', '22P02', '22003', '22007', '22008'):
            return HTTPException(422, 'Controlla tipo di materiale, caratteristiche, quantità, data e prezzi.')
    return HTTPException(503, 'Operazione non riuscita. Riprova oppure aggiorna il magazzino per verificare i dati.')


def archive_stock(client: httpx.Client, user_id: UUID, location_id: UUID, inventory_id: UUID):
    get_authorized_location(client, user_id, location_id)
    try:
        sale_inventory_repository.archive_stock(client, location_id, inventory_id)
    except httpx.HTTPError as error:
        raise sale_inventory_error(error) from error
