from datetime import timezone
from uuid import UUID
from zoneinfo import ZoneInfo

import httpx
from fastapi import HTTPException

from app.repositories import rental_booking_repository
from app.schemas.rental_booking import RentalBookingCreate, RentalPaymentCreate
from app.services.rental_history_service import read_history
from app.services.operator_service import get_authorized_location


def confirm_booking(client: httpx.Client, user_id: UUID, location_id: UUID, data: RentalBookingCreate):
    get_authorized_location(client, user_id, location_id)
    payload = data.model_dump(mode='json', exclude={'booking_id'})
    # Mantiene identici i ritentativi delle conferme precedenti a questo campo.
    if payload['notes'] is None:
        payload.pop('notes')
    if data.payment:
        payload['payment'] = payment_payload(data.payment)
    try:
        return rental_booking_repository.confirm_booking(client, location_id, data.booking_id, payload)
    except httpx.HTTPStatusError as error:
        try:
            body = error.response.json()
        except ValueError:
            body = {}
        code = body.get('code') if isinstance(body, dict) else None
        if code == 'PGRST202':
            raise HTTPException(503, 'Eseguire 012_confirm_rental_booking.sql in Supabase.') from error
        if code in ('42P01', '42703'):
            raise HTTPException(503, 'Verifica le query 020 e 021 per le promozioni in Supabase.') from error
        if code == 'P0001':
            raise HTTPException(409, body.get('message', 'Disponibilità o prezzi cambiati. Aggiorna il noleggio.')) from error
        if code == '42501':
            raise HTTPException(403, 'Non sei autorizzato a confermare noleggi in questa sede.') from error
        if code in ('22023', '22P02', '22003', '23514', '23503'):
            raise HTTPException(422, 'Controlla cliente, date, materiale e pagamento.') from error
        raise HTTPException(503, 'Conferma non riuscita. Riprova con lo stesso modulo per evitare duplicati.') from error
    except httpx.HTTPError as error:
        raise HTTPException(503, 'Connessione interrotta. Riprova con lo stesso modulo: la conferma non verrà duplicata.') from error


def payment_payload(payment):
    local = payment.paid_at_local
    aware = local.replace(tzinfo=ZoneInfo('Europe/Rome'))
    utc = aware.astimezone(timezone.utc)
    if utc.astimezone(ZoneInfo('Europe/Rome')).replace(tzinfo=None) != local:
        raise HTTPException(422, 'L’ora del pagamento non esiste per il cambio di ora legale.')
    payload = payment.model_dump(mode='json', exclude={'payment_id', 'paid_at_local'})
    payload['paid_at'] = utc.isoformat()
    return payload


def register_payment(client: httpx.Client, user_id: UUID, location_id: UUID, booking_id: UUID, data: RentalPaymentCreate):
    get_authorized_location(client, user_id, location_id)
    payload = payment_payload(data)
    try:
        rental_booking_repository.register_payment(client, location_id, booking_id, data.payment_id, payload)
    except httpx.HTTPStatusError as error:
        try:
            body = error.response.json()
        except ValueError:
            body = {}
        code = body.get('code') if isinstance(body, dict) else None
        if code == 'PGRST202':
            raise HTTPException(503, 'Eseguire 014_register_rental_payment.sql in Supabase.') from error
        if code == '42501':
            raise HTTPException(403, 'Non sei autorizzato a registrare pagamenti in questa sede.') from error
        if code in ('P0001', 'P0002'):
            raise HTTPException(409, body.get('message', 'Saldo aggiornato da un altro operatore. Aggiorna i rientri.')) from error
        if code in ('22023', '22P02', '22003', '23514'):
            raise HTTPException(422, 'Controlla importo, metodo e data del pagamento.') from error
        raise HTTPException(503, 'Registrazione non riuscita. Riprova dallo stesso modulo per evitare duplicati.') from error
    except httpx.HTTPError as error:
        raise HTTPException(503, 'Connessione interrotta. Riprova dallo stesso modulo: il pagamento non verrà duplicato.') from error
    return read_history(client, user_id, location_id, history_only=False, booking_id=booking_id)
