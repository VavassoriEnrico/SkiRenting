from uuid import UUID

import httpx
from fastapi import HTTPException

from app.repositories import customer_repository
from app.schemas.customer import CustomerCreate, CustomerUpdate
from app.services.operator_service import get_operator_session


def list_customers(client: httpx.Client, user_id: UUID) -> list[dict]:
    # Anagrafica condivisa: serve un profilo operatore con almeno una sede.
    operator = get_operator_session(client, user_id)
    try:
        customers = customer_repository.list_customers(client)
        if not customers:
            return []
        counts = customer_repository.booking_counts(client, [str(site.id) for site in operator.locations])
        return [{**customer, 'booking_count': counts[customer['id']]} for customer in customers]
    except httpx.HTTPStatusError as error:
        try:
            body = error.response.json()
        except ValueError:
            body = {}
        if isinstance(body, dict) and body.get('code') in ('42703', 'PGRST204'):
            raise HTTPException(503, 'Eseguire 015_customer_profile_fields.sql e 017_customer_management.sql in Supabase.') from error
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
        return customer_repository.create_customer(client, data.model_dump(mode='json'))
    except httpx.HTTPStatusError as error:
        try:
            body = error.response.json()
        except ValueError:
            body = {}
        code = body.get('code') if isinstance(body, dict) else None
        if code in ('42703', 'PGRST204'):
            raise HTTPException(503, 'Eseguire 015_customer_profile_fields.sql e 017_customer_management.sql in Supabase.') from error
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


def update_customer(client: httpx.Client, user_id: UUID, customer_id: UUID, data: CustomerUpdate):
    get_operator_session(client, user_id)
    payload = data.model_dump(mode='json', exclude_unset=True)
    if not payload:
        raise HTTPException(422, 'Nessuna modifica indicata.')
    try:
        result = customer_repository.update_customer(client, customer_id, payload)
        if result is None:
            raise HTTPException(404, 'Cliente non trovato o già eliminato.')
        return result
    except httpx.HTTPError as error:
        raise management_error(error) from error


def delete_customer(client: httpx.Client, user_id: UUID, customer_id: UUID):
    get_operator_session(client, user_id)
    try:
        customer_repository.delete_customer(client, customer_id)
    except httpx.HTTPError as error:
        raise management_error(error) from error


def management_error(error: httpx.HTTPError):
    if isinstance(error, httpx.HTTPStatusError):
        try:
            body = error.response.json()
        except ValueError:
            body = {}
        code = body.get('code') if isinstance(body, dict) else None
        if code in ('PGRST202', '42703', 'PGRST204'):
            return HTTPException(503, 'Eseguire 017_customer_management.sql in Supabase.')
        if code == '42501' or error.response.status_code in (401,403):
            return HTTPException(403, 'Non sei autorizzato a gestire i clienti.')
        if code == 'P0002':
            return HTTPException(404, 'Cliente non trovato.')
        if code in ('23502','23514','22001','22007','22008'):
            return HTTPException(422, 'Controlla i dati. Nome e cognome sono obbligatori per i clienti non storici.')
    return HTTPException(503, 'Operazione non riuscita. Riprova oppure aggiorna l’anagrafica per verificare i dati.')
