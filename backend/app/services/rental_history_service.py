from collections import defaultdict
from decimal import ROUND_HALF_UP, Decimal
from datetime import datetime
from zoneinfo import ZoneInfo
from uuid import UUID

import httpx
from fastapi import HTTPException

from app.repositories import rental_history_repository
from app.services.operator_service import get_authorized_location


def enrich(headers: list[dict], items: list[dict], payments: list[dict], details: bool) -> list[dict]:
    by_item, by_payment = defaultdict(list), defaultdict(list)
    for item in items:
        by_item[item['booking_id']].append(item)
    for payment in payments:
        by_payment[payment['booking_id']].append(payment)
    result = []
    for header in headers:
        booking_items = by_item[header['id']]
        booking_payments = by_payment[header['id']]
        subtotal = sum((Decimal(str(item['amount'])) for item in booking_items), Decimal('0'))
        paid = sum((Decimal(str(payment['amount'])) for payment in booking_payments), Decimal('0'))
        total = (subtotal * (100 - Decimal(str(header['discount_percent']))) / 100).quantize(
            Decimal('0.01'), rounding=ROUND_HALF_UP,
        )
        row = {**header, 'item_count': len(booking_items),
               'returned_item_count': sum(item['returned_at'] is not None for item in booking_items), 'subtotal': subtotal,
               'discount_amount': subtotal - total, 'total': total, 'paid_amount': paid, 'balance': total - paid}
        if details:
            row.update(items=booking_items, payments=booking_payments)
        result.append(row)
    return result


def read_history(client: httpx.Client, user_id: UUID, location_id: UUID, history_only=True, booking_id: UUID | None = None):
    get_authorized_location(client, user_id, location_id)
    try:
        headers = rental_history_repository.get_headers(client, location_id, history_only, booking_id)
        if booking_id and not headers:
            raise HTTPException(404, 'Noleggio non trovato in questa sede.')
        items, payments = rental_history_repository.get_children(client, headers)
        result = enrich(headers, items, payments, details=booking_id is not None)
        return result[0] if booking_id else result
    except httpx.HTTPError as error:
        raise history_error(error) from error


def history_error(error: httpx.HTTPError) -> HTTPException:
    if isinstance(error, httpx.HTTPStatusError):
        try:
            body = error.response.json()
        except ValueError:
            body = {}
        if isinstance(body, dict) and body.get('code') in ('42703', 'PGRST204'):
            return HTTPException(503, 'Verifica 015_customer_profile_fields.sql e 021_apply_rental_promotions.sql in Supabase.')
        if isinstance(body, dict) and body.get('code') in ('PGRST205', '42P01'):
            return HTTPException(503, 'Tabelle noleggio non disponibili. Verificare la query 007.')
        return HTTPException(503, 'Impossibile caricare i noleggi da Supabase.')
    return HTTPException(503, 'Impossibile raggiungere Supabase per caricare i noleggi.')


def current_return_date():
    return datetime.now(ZoneInfo('Europe/Rome')).date()


def read_today_returns(client: httpx.Client, user_id: UUID, location_id: UUID):
    get_authorized_location(client, user_id, location_id)
    today = current_return_date()
    try:
        headers = rental_history_repository.get_due_headers(client, location_id, today)
        items, payments = rental_history_repository.get_children(client, headers)
        by_booking = defaultdict(list)
        for item in items:
            by_booking[item['booking_id']].append(item)
        bookings = []
        for header in enrich(headers, items, payments, details=False):
            booking_items = by_booking[header['id']]
            if booking_items:
                bookings.append({**header, 'items': booking_items})
        return {'due_on': today, 'bookings': bookings}
    except httpx.HTTPError as error:
        raise history_error(error) from error


def register_return(client: httpx.Client, user_id: UUID, location_id: UUID, data):
    get_authorized_location(client, user_id, location_id)
    try:
        result = rental_history_repository.register_return(client, location_id, data.request_id, data.code)
    except httpx.HTTPStatusError as error:
        try:
            body = error.response.json()
        except ValueError:
            body = {}
        code = body.get('code') if isinstance(body, dict) else None
        if code in ('PGRST202', '42703', '42P01'):
            raise HTTPException(503, 'Eseguire 013_register_rental_return.sql in Supabase.') from error
        if code == '42501':
            raise HTTPException(403, 'Non sei autorizzato a registrare rientri in questa sede.') from error
        if code in ('P0001', 'P0002'):
            raise HTTPException(409, body.get('message', 'Codice non disponibile per il rientro.')) from error
        if code in ('22023', '23514'):
            raise HTTPException(422, 'Controlla codice e date del noleggio.') from error
        raise HTTPException(503, 'Registrazione non riuscita. Riprova dallo stesso modulo.') from error
    except httpx.HTTPError as error:
        raise HTTPException(503, 'Connessione interrotta. Riprova dallo stesso modulo: il rientro non verrà duplicato.') from error
    return read_history(client, user_id, location_id, history_only=False, booking_id=UUID(result['booking_id']))
