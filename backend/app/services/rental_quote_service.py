from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID

import httpx
from fastapi import HTTPException

from app.repositories import rental_quote_repository
from app.schemas.rental_quote import QuoteItem, RentalQuoteRead, RentalQuoteRequest
from app.services.operator_service import get_authorized_location


def calculate_quote(data: RentalQuoteRequest, items: list[dict], rates: list[dict], hotel: dict | None):
    # Date, non ore: inclusivo e indipendente dai cambi di ora legale.
    days = (data.ends_on - data.starts_on).days + 1
    column = 'daily_price_1_day' if days == 1 else (
        f'daily_price_{days}_days' if days < 7 else 'daily_price_7_plus_days'
    )
    by_group = {str(rate['group_id']): rate for rate in rates}
    by_item = {str(item['id']): item for item in items}
    lines = []
    missing = []
    for inventory_id in data.inventory_ids:
        item = by_item[str(inventory_id)]
        raw_price = by_group.get(str(item['group']['id']), {}).get(column)
        price = Decimal(str(raw_price)) if raw_price is not None else None
        amount = price * days if price is not None else None
        if price is None:
            missing.append(item['code'])
        lines.append(QuoteItem(
            inventory_id=inventory_id, code=item['code'], brand=item['variant']['brand'],
            model=item['variant']['model'], group_name=item['group']['name'],
            daily_price=price, amount=amount,
        ))
    percent = Decimal(str(hotel['discount'])) if hotel else Decimal('0')
    subtotal = sum((line.amount for line in lines), Decimal('0')) if not missing else None
    total = (subtotal * (100 - percent) / 100).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP) if subtotal is not None else None
    discount = subtotal - total if subtotal is not None else None
    return RentalQuoteRead(
        starts_on=data.starts_on, ends_on=data.ends_on, days=days, items=lines,
        hotel=hotel, discount_percent=percent, subtotal=subtotal,
        discount_amount=discount, total=total, missing_rate_codes=missing,
    )


def get_quote(client: httpx.Client, user_id: UUID, location_id: UUID, data: RentalQuoteRequest):
    get_authorized_location(client, user_id, location_id)
    try:
        items = rental_quote_repository.get_items(client, location_id, data.inventory_ids)
        if {str(item['id']) for item in items} != {str(value) for value in data.inventory_ids}:
            raise HTTPException(409, 'Uno o più articoli non sono più nel magazzino della sede. '
                                    'Rimuovili dalla selezione e aggiorna il materiale.')
        if any(item['status'] != 'active' or not item['is_rentable'] or not item['is_bookable'] for item in items):
            raise HTTPException(409, 'Uno o più articoli selezionati non sono più abilitati al noleggio.')
        hotel = rental_quote_repository.get_hotel(client, data.hotel_id) if data.hotel_id else None
        if data.hotel_id and hotel is None:
            raise HTTPException(409, 'L’albergo selezionato non è più attivo. Seleziona un altro albergo.')
        groups = sorted({str(item['group']['id']) for item in items})
        rates = rental_quote_repository.get_rates(client, groups)
        return calculate_quote(data, items, rates, hotel)
    except httpx.HTTPStatusError as error:
        try:
            body = error.response.json()
        except ValueError:
            body = {}
        if isinstance(body, dict) and body.get('code') in ('PGRST205', '42P01', '42703', 'PGRST204'):
            raise HTTPException(503, 'Verifica le query 009 (sconto alberghi) e 010 (tariffe) in Supabase.') from error
        raise HTTPException(503, 'Impossibile calcolare i prezzi. Riprova.') from error
    except httpx.HTTPError as error:
        raise HTTPException(503, 'Impossibile raggiungere Supabase per calcolare i prezzi.') from error
