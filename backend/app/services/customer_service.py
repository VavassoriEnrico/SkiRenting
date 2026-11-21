from uuid import UUID

import httpx
from fastapi import HTTPException

from app.repositories import customer_repository
from app.schemas.customer import CustomerCreate
from app.services.operator_service import get_operator_session


def list_customers(client: httpx.Client, user_id: UUID) -> list[dict]:
    # Anagrafica condivisa: serve un profilo operatore con almeno una sede.
    get_operator_session(client, user_id)
    try:
        return customer_repository.list_customers(client)
    except httpx.HTTPStatusError as error:
        try:
            body = error.response.json()
        except ValueError:
            body = {}
        if isinstance(body, dict) and body.get('code') in ('PGRST205', '42P01'):
            raise HTTPException(
                503, 'Tabella clienti non disponibile. Eseguire 006_customers.sql in Supabase.',
            ) from error
        raise HTTPException(503, 'Impossibile caricare i clienti da Supabase.') from error
    except httpx.HTTPError as error:
        raise HTTPException(503, 'Impossibile caricare i clienti da Supabase.') from error


def create_customer(client: httpx.Client, user_id: UUID, data: CustomerCreate) -> dict:
    get_operator_session(client, user_id)
    try:
        return customer_repository.create_customer(client, data.model_dump())
    except httpx.HTTPStatusError as error:
        try:
            body = error.response.json()
        except ValueError:
            body = {}
        code = body.get('code') if isinstance(body, dict) else None
        if code in ('PGRST205', '42P01'):
            raise HTTPException(
                503, 'Tabella clienti non disponibile. Eseguire 006_customers.sql in Supabase.',
            ) from error
        if error.response.status_code in (401, 403) or code == '42501':
            raise HTTPException(403, 'Non sei autorizzato a registrare clienti.') from error
        if code in ('23502', '23514', '22001'):
            raise HTTPException(422, 'Controlla i dati del cliente.') from error
        raise HTTPException(503, 'Impossibile salvare il cliente. '
                            'Verifica nell’anagrafica prima di riprovare.') from error
    except httpx.HTTPError as error:
        raise HTTPException(503, 'Connessione interrotta durante il salvataggio. '
                            'Verifica nell’anagrafica se il cliente è stato registrato.') from error
