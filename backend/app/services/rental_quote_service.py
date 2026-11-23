from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID

import httpx
from fastapi import HTTPException

from app.repositories import rental_quote_repository, promotion_repository
from app.services.promotion_service import best_promotion_for_day
from app.schemas.rental_quote import QuoteItem, RentalQuoteRead, RentalQuoteRequest
from app.services.operator_service import get_authorized_location


def calculate_quote(data: RentalQuoteRequest, items: list[dict], rates: list[dict], hotel: dict | None, promotions: list[dict] | None = None):
    # Date, non ore: inclusivo e indipendente dai cambi di ora legale.
    days = (data.ends_on - data.starts_on).days + 1
    column = 'daily_price_1_day' if days == 1 else (
        f'daily_price_{days}_days' if days < 7 else 'daily_price_7_plus_days'
    )
    by_group = {str(rate['group_id']): rate for rate in rates}
    by_item = {str(item['id']): item for item in items}
    pack_column = column.replace('daily_price_', 'pack_price_')
    main_boots = {}
    boot_mains = {}
    # Ogni attrezzo usa i primi scarponi compatibili ancora liberi.
    for identifier in data.inventory_ids:
        category = by_item[str(identifier)]['variant']['category']['code']
        boot_category = {'ski': 'ski_boots', 'snowboard': 'snowboard_boots'}.get(category)
        if not boot_category:
            continue
        boot_id = next((candidate for candidate in data.inventory_ids
                        if candidate not in boot_mains
                        and by_item[str(candidate)]['variant']['category']['code'] == boot_category), None)
        if boot_id:
            main_boots[identifier] = boot_id
            boot_mains[boot_id] = identifier
    lines = []
    missing = []
    ski_ids = [identifier for identifier in data.inventory_ids
               if by_item[str(identifier)]['variant']['category']['code'] == 'ski']
    if data.pole_quantity > 1 and not any(item.get('is_generic') for item in items):
        raise HTTPException(422, 'La quantità è ammessa solo per il codice generico 1.')
    pole_index = 0
    for inventory_id in data.inventory_ids:
        item = by_item[str(inventory_id)]
        quantity = data.pole_quantity if item.get('is_generic') else 1
        for pair in range(quantity):
            main_id = boot_mains.get(inventory_id)
            if item['variant']['category']['code'] == 'poles':
                if pole_index < len(ski_ids):
                    main_id = ski_ids[pole_index]
                pole_index += 1
            is_pack = inventory_id in main_boots
            raw_price = 0 if main_id else by_group.get(str(item['group']['id']), {}).get(pack_column if is_pack else column)
            price = Decimal(str(raw_price)) if raw_price is not None else None
            amount = price * days if price is not None else None
            if price is None and item['code'] not in missing:
                missing.append(item['code'])
            lines.append(QuoteItem(
                inventory_id=inventory_id, code=item['code'], brand=item['variant']['brand'],
                model=item['variant']['model'], group_name=item['group']['name'],
                daily_price=price, amount=amount,
                line_key=f'{inventory_id}:{pair + 1}' if item.get('is_generic') else str(inventory_id),
                price_mode='included' if main_id else 'pack' if is_pack else 'single',
                pack_main_id=inventory_id if is_pack else main_id,
            ))
    pack_mains = {line.pack_main_id for line in lines if line.pack_main_id}
    for line in lines:
        if line.inventory_id in pack_mains:
            line.pack_main_id = line.inventory_id
    percent = Decimal(str(hotel['discount'])) if hotel else Decimal('0')
    promotion = best_promotion_for_day(promotions or [], data.starts_on) if days == 1 else None
    # A parità di percentuale resta lo sconto albergo, senza cumulo.
    if promotion and Decimal(str(promotion['discount_percent'])) > percent:
        percent = Decimal(str(promotion['discount_percent']))
    else:
        promotion = None
    subtotal = sum((line.amount for line in lines), Decimal('0')) if not missing else None
    total = (subtotal * (100 - percent) / 100).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP) if subtotal is not None else None
    discount = subtotal - total if subtotal is not None else None
    return RentalQuoteRead(
        starts_on=data.starts_on, ends_on=data.ends_on, days=days, items=lines,
        hotel=hotel, promotion=promotion, discount_percent=percent, subtotal=subtotal,
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
        promotions = promotion_repository.list_promotions(client) if data.starts_on == data.ends_on else []
        return calculate_quote(data, items, rates, hotel, promotions)
    except httpx.HTTPStatusError as error:
        try:
            body = error.response.json()
        except ValueError:
            body = {}
        if isinstance(body, dict) and body.get('code') in ('PGRST205', '42P01', '42703', 'PGRST204'):
            raise HTTPException(503, 'Verifica 009, 010 e 027_daily_pack_rates.sql per il listino, 020 e 022 per le promozioni in Supabase.') from error
        raise HTTPException(503, 'Impossibile calcolare i prezzi. Riprova.') from error
    except httpx.HTTPError as error:
        raise HTTPException(503, 'Impossibile raggiungere Supabase per calcolare i prezzi.') from error
