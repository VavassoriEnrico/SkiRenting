from datetime import date, datetime
from uuid import UUID
from zoneinfo import ZoneInfo

import httpx
from fastapi import HTTPException

from app.repositories import rental_inventory_repository, material_repair_repository
from app.schemas.rental_inventory import RentalInventoryRead, RentalInventorySummary, RentalItemCreate, RentalArrivalCreate
from app.services.operator_service import get_authorized_location, get_operator_session



def inventory_summary(client: httpx.Client, items: list[dict], repairs: dict, today: date, rented_ids: set[str] | None = None) -> RentalInventorySummary:
    if rented_ids is None:
        rented_ids = rental_inventory_repository.unavailable_item_ids(client, items, today, today)
    return RentalInventorySummary(
        currently_rented=len(rented_ids),
        currently_in_repair=sum(item['status'] == 'maintenance' or item['id'] in repairs for item in items),
    )


def get_inventory(
    client: httpx.Client, user_id: UUID, location_id: UUID, available_only: bool = False,
    starts_on: date | None = None, ends_on: date | None = None,
) -> RentalInventoryRead:
    get_authorized_location(client, user_id, location_id)
    if (starts_on is None) != (ends_on is None) or (starts_on and ends_on < starts_on):
        raise HTTPException(422, 'Indica entrambe le date con rientro non precedente all’inizio.')
    try:
        items = rental_inventory_repository.list_items(client, location_id)
        summary = None
        today = datetime.now(ZoneInfo('Europe/Rome')).date()
        if available_only:
            items += rental_inventory_repository.list_generic_items(client)
            blocked = rental_inventory_repository.unavailable_item_ids(client, items, starts_on or today, ends_on or today)
            items = [item for item in items if item['id'] not in blocked]
            repairs = material_repair_repository.open_for_items(client,items)
            items = [{**item,'open_repair':repairs.get(item['id'])} for item in items]
        else:
            repairs = material_repair_repository.open_for_items(client, items)
            summary = inventory_summary(client, items, repairs, today)
        return RentalInventoryRead(
            summary=summary,
            categories=rental_inventory_repository.list_categories(client),
            items=items,
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


def transfer_item(
    client: httpx.Client, user_id: UUID, item_id: UUID, source: UUID, destination: UUID,
):
    if source == destination:
        raise HTTPException(422, 'Scegli una sede di destinazione diversa.')
    get_authorized_location(client, user_id, source)
    get_authorized_location(client, user_id, destination)
    try:
        return rental_inventory_repository.transfer_item(client, item_id, source, destination)
    except httpx.HTTPStatusError as error:
        try:
            body = error.response.json()
        except ValueError:
            body = {}
        code = body.get('code') if isinstance(body, dict) else None
        messages = {
            'PGRST202': (503, 'Eseguire 011_rental_inventory_transfers.sql in Supabase.'),
            '42501': (403, 'Non sei autorizzato a trasferire articoli tra queste sedi.'),
            'P0002': (404, 'Articolo non trovato.'),
            '23514': (409, 'L’articolo è già stato spostato. Aggiorna il magazzino.'),
            '55000': (409, 'L’articolo è assegnato a un noleggio aperto e non può essere spostato.'),
            '22023': (422, 'Scegli una sede di destinazione diversa.'),
        }
        status, message = messages.get(code, (503, 'Trasferimento non riuscito. Verifica la sede dell’articolo prima di riprovare.'))
        raise HTTPException(status, message) from error
    except httpx.HTTPError as error:
        raise HTTPException(503, 'Connessione interrotta. Verifica la sede dell’articolo prima di riprovare.') from error


def get_general_inventory(client: httpx.Client, user_id: UUID):
    operator = get_operator_session(client,user_id)
    location_ids = [str(location.id) for location in operator.locations]
    try:
        items = rental_inventory_repository.list_items_for_locations(client,location_ids)
        repairs = material_repair_repository.open_for_items(client,items)
        today = datetime.now(ZoneInfo('Europe/Rome')).date()
        rented_ids = rental_inventory_repository.unavailable_item_ids(client, items, today, today)
        return {
            'summary': inventory_summary(client, items, repairs, today, rented_ids),
            'categories': rental_inventory_repository.list_categories(client),
            'locations': operator.locations,
            'items': [{**item,'open_repair':repairs.get(item['id']),'is_currently_rented':item['id'] in rented_ids} for item in items],
        }
    except httpx.HTTPError as error:
        raise HTTPException(503,'Impossibile caricare il magazzino generale da Supabase.') from error


def archive_items(client: httpx.Client, user_id: UUID, location_id: UUID, item_ids: list[UUID]):
    get_authorized_location(client, user_id, location_id)
    try:
        return rental_inventory_repository.archive_items(client, location_id, item_ids)
    except httpx.HTTPStatusError as error:
        try:
            body = error.response.json()
        except ValueError:
            body = {}
        code = body.get('code') if isinstance(body, dict) else None
        if code == '55000':
            raise HTTPException(409, 'Impossibile dismettere: uno degli esemplari è assegnato a un noleggio, ancora da riconsegnare o ha una riparazione aperta.') from error
        if code == 'P0002':
            raise HTTPException(404, 'Articolo non trovato nella sede selezionata. Aggiorna il magazzino.') from error
        if code == '42501':
            raise HTTPException(403, 'Non sei autorizzato a dismettere articoli di questa sede.') from error
        if code in ('PGRST202', 'PGRST204', '42703'):
            raise HTTPException(503, 'Eseguire 032_archive_rental_inventory.sql in Supabase.') from error
        if code == '22023':
            raise HTTPException(422, 'Seleziona gli esemplari da dismettere. Il materiale generico condiviso non può essere dismesso.') from error
        raise HTTPException(503, 'Dismissione non riuscita. Aggiorna il magazzino per verificare gli articoli.') from error
    except httpx.HTTPError as error:
        raise HTTPException(503, 'Connessione interrotta. Verifica il magazzino prima di riprovare.') from error


def register_arrival(client: httpx.Client, user_id: UUID, location_id: UUID, data: RentalArrivalCreate):
    get_authorized_location(client, user_id, location_id)
    try:
        return rental_inventory_repository.register_arrival(client, location_id,
            data.model_dump(mode='json', exclude_none=True))
    except httpx.HTTPStatusError as error:
        try:
            body = error.response.json()
        except ValueError:
            body = {}
        code = body.get('code') if isinstance(body, dict) else None
        if code in ('PGRST202', 'PGRST204', '42703', '42P01'):
            raise HTTPException(503, 'Eseguire 033_rental_stock_arrivals.sql in Supabase.') from error
        if code == '23505':
            raise HTTPException(409, 'Un codice è già presente oppure questo arrivo è stato utilizzato con dati diversi. Nessun nuovo esemplare è stato caricato: controlla i codici e riprova.') from error
        raise inventory_error(error) from error
    except httpx.HTTPError as error:
        raise HTTPException(503, 'Connessione interrotta. Puoi ritentare lo stesso carico senza cambiare i dati: non verrà duplicato.') from error


def get_retired_inventory(client: httpx.Client, user_id: UUID):
    operator = get_operator_session(client, user_id)
    try:
        return {
            'categories': rental_inventory_repository.list_categories(client),
            'locations': operator.locations,
            'items': rental_inventory_repository.list_retired_items(client, [str(site.id) for site in operator.locations]),
        }
    except httpx.HTTPError as error:
        raise HTTPException(503, 'Impossibile caricare gli articoli dismessi. Verifica che la migrazione 032 sia stata eseguita.') from error


def reactivate_item(client: httpx.Client, user_id: UUID, location_id: UUID, item_id: UUID):
    get_authorized_location(client, user_id, location_id)
    try:
        return rental_inventory_repository.reactivate_item(client, location_id, item_id)
    except httpx.HTTPStatusError as error:
        try:
            body = error.response.json()
        except ValueError:
            body = {}
        code = body.get('code') if isinstance(body, dict) else None
        messages = {
            'P0002': (404, 'Articolo non trovato nella sede selezionata.'),
            '42501': (403, 'Non sei autorizzato a riattivare articoli di questa sede.'),
            '55000': (409, 'Impossibile riattivare: verifica eventuali riparazioni aperte e che modello e gruppo siano abilitati.'),
            '22023': (422, 'Il materiale generico condiviso non può essere riattivato da qui.'),
            'PGRST202': (503, 'Eseguire 034_reactivate_rental_inventory.sql in Supabase.'),
        }
        status, message = messages.get(code, (503, 'Riattivazione non riuscita. Verifica il magazzino prima di riprovare.'))
        raise HTTPException(status, message) from error
    except httpx.HTTPError as error:
        raise HTTPException(503, 'Connessione interrotta. Puoi ritentare la riattivazione.') from error
