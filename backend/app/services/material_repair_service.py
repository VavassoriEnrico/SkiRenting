from uuid import UUID

import httpx
from fastapi import HTTPException
from app.repositories import material_repair_repository as repository
from app.services.operator_service import get_authorized_location


def repair_error(error):
    if isinstance(error,httpx.HTTPStatusError):
        try:
            body = error.response.json()
        except ValueError:
            body = {}
        code = body.get('code') if isinstance(body,dict) else None
        if code in ('PGRST202','PGRST205','42P01','42703'):
            return HTTPException(503,'Eseguire le query 018_material_repairs.sql e 019_material_repairs_workflow.sql in Supabase.')
        if code=='42501': return HTTPException(403,'Sede non autorizzata per le riparazioni.')
        if code=='P0002': return HTTPException(404,body.get('message','Articolo o riparazione non trovati.'))
        if code in ('P0001','23505'): return HTTPException(409,body.get('message','Riparazione già presente o articolo aggiornato.'))
        if code in ('22023','23514'): return HTTPException(422,body.get('message','Controlla i dati della riparazione.'))
    return HTTPException(503,'Operazione sulle riparazioni non riuscita. Riprova con gli stessi dati o aggiorna l’elenco.')


def list_repairs(client,user_id: UUID,location_id: UUID):
    get_authorized_location(client,user_id,location_id)
    try:
        return repository.list_open(client,location_id)
    except httpx.HTTPError as error:
        raise repair_error(error) from error


def create_repair(client,user_id: UUID,location_id: UUID,data):
    get_authorized_location(client,user_id,location_id)
    try:
        return repository.create(client,location_id,data)
    except httpx.HTTPError as error:
        raise repair_error(error) from error


def complete_repair(client,user_id: UUID,location_id: UUID,repair_id: UUID,item_id: UUID):
    get_authorized_location(client,user_id,location_id)
    try:
        repository.complete(client,location_id,repair_id,item_id)
        item = repository.get_item(client,location_id,item_id)
        if item is None: raise HTTPException(409,'Articolo spostato. Aggiorna il materiale.')
        if item['status'] != 'active' or not item['is_rentable'] or not item['is_bookable']:
            raise HTTPException(409,'Articolo non più disponibile. Ripeti la ricerca.')
        if repository.open_for_items(client,[item]):
            raise HTTPException(409,'Articolo nuovamente in riparazione. Ripeti la ricerca.')
        return {**item,'open_repair':None}
    except httpx.HTTPError as error:
        raise repair_error(error) from error
