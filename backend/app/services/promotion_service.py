from datetime import date
from decimal import Decimal
from uuid import UUID

import httpx
from fastapi import HTTPException

from app.repositories import promotion_repository
from app.schemas.promotion import PromotionCreate
from app.services.operator_service import get_operator_session


def database_error(error: httpx.HTTPError):
    if isinstance(error, httpx.HTTPStatusError):
        try:
            code = error.response.json().get('code')
        except (ValueError, AttributeError):
            code = None
        if code in ('PGRST205', '42P01'):
            return HTTPException(503, 'Promozioni non configurate. Esegui 020_promotions.sql in Supabase.')
        if code in ('42703', 'PGRST204'):
            return HTTPException(503, 'Periodi promozionali non configurati. Esegui 022_promotions_period.sql in Supabase.')
        if code == '42501':
            return HTTPException(403, 'Gestione promozioni non autorizzata. Verifica la query 020.')
        if code in ('23514', '23502', '22003'):
            return HTTPException(422, 'Controlla la data, i giorni e la percentuale della promozione.')
    return HTTPException(503, 'Operazione sulle promozioni non riuscita. Aggiorna l’elenco prima di riprovare.')


def list_promotions(client: httpx.Client, user_id: UUID):
    get_operator_session(client, user_id)
    try:
        return promotion_repository.list_promotions(client)
    except httpx.HTTPError as error:
        raise database_error(error) from error


def create(client: httpx.Client, user_id: UUID, data: PromotionCreate):
    get_operator_session(client, user_id)
    try:
        return promotion_repository.create(client, data)
    except httpx.HTTPError as error:
        raise database_error(error) from error


def remove(client: httpx.Client, user_id: UUID, promotion_id: UUID):
    get_operator_session(client, user_id)
    try:
        if not promotion_repository.remove(client, promotion_id):
            raise HTTPException(404, 'Promozione non trovata o già rimossa.')
    except httpx.HTTPError as error:
        raise database_error(error) from error


def best_promotion_for_day(promotions: list[dict], day: date) -> dict | None:
    candidates = [promotion for promotion in promotions if promotion['is_active']
                  and Decimal(str(promotion['discount_percent'])) > 0
                  and (str(promotion['promotion_date']) == day.isoformat()
                       or (promotion.get('starts_on') is not None and promotion.get('ends_on') is not None
                           and str(promotion['starts_on']) <= day.isoformat() <= str(promotion['ends_on']))
                       or (promotion['promotion_date'] is None and day.isoweekday() in promotion['weekdays']))]
    # Stesso ordinamento della conferma SQL, anche a parità di percentuale.
    return min(candidates, key=lambda promotion: (
        -Decimal(str(promotion['discount_percent'])), str(promotion['id']),
    ), default=None)
