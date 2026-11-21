from uuid import UUID

import httpx
from fastapi import HTTPException

from app.repositories import rental_inventory_repository
from app.schemas.rental_inventory import RentalInventoryRead, RentalItemCreate
from app.services.operator_service import get_authorized_location


def get_inventory(client: httpx.Client, user_id: UUID, location_id: UUID) -> RentalInventoryRead:
    get_authorized_location(client, user_id, location_id)
    try:
        return RentalInventoryRead(
            categories=rental_inventory_repository.list_categories(client),
            items=rental_inventory_repository.list_items(client, location_id),
        )
    except httpx.HTTPError as error:
        raise HTTPException(
            503, "Impossibile caricare il magazzino noleggio da Supabase.",
        ) from error


def inventory_error(error: httpx.HTTPError) -> HTTPException:
    if isinstance(error, httpx.HTTPStatusError):
        try:
            body = error.response.json()
        except ValueError:
            body = {}
        code = body.get('code') if isinstance(body, dict) else None
        if code in ('PGRST202', '42703'):
            return HTTPException(503, 'Eseguire la query 005_create_rental_item.sql in Supabase.')
        if code == '23505':
            return HTTPException(409, 'Codice articolo, nome o codice categoria già esistente. '
                                 'Controlla i dati oppure seleziona la voce esistente.')
        if code == '42501':
            return HTTPException(403, 'Non sei autorizzato a inserire articoli in questa sede.')
        if code in ('23514', '23502', '23503', '22023', '22P02', '22003'):
            return HTTPException(
                422, 'Dati non validi: controlla categoria, gruppo e caratteristiche.',
            )
    return HTTPException(503, 'Impossibile completare l’operazione su Supabase. '
                             'Se stavi salvando, verifica il codice prima di riprovare.')


def get_catalog(client: httpx.Client, user_id: UUID, location_id: UUID):
    get_authorized_location(client, user_id, location_id)
    try:
        return rental_inventory_repository.get_catalog(client)
    except httpx.HTTPError as error:
        raise inventory_error(error) from error


def create_item(
    client: httpx.Client, user_id: UUID, location_id: UUID, data: RentalItemCreate,
):
    get_authorized_location(client, user_id, location_id)
    try:
        return rental_inventory_repository.create_item(
            client, location_id, data.model_dump(mode='json', exclude_none=True),
        )
    except httpx.HTTPError as error:
        raise inventory_error(error) from error
