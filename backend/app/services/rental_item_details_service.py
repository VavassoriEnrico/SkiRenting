from datetime import datetime, time
import re
from uuid import UUID
from zoneinfo import ZoneInfo

import httpx
from fastapi import HTTPException

from app.repositories.material_repair_repository import get_item
from app.repositories.rental_inventory_repository import read_all
from app.services.operator_service import get_authorized_location


def historical_code_filter(code: str) -> str:
    # Regex ancorata e con simboli letterali: uguaglianza case-insensitive, non ricerca parziale.
    return f'imatch.^{re.escape(code)}$'


def get_item_details(client: httpx.Client, user_id: UUID, location_id: UUID, item_id: UUID, retired_only=False):
    get_authorized_location(client, user_id, location_id)
    now = datetime.now(ZoneInfo('Europe/Rome'))
    try:
        item = get_item(client, location_id, item_id, retired_only=retired_only)
        if item is None:
            raise HTTPException(404, 'Articolo non trovato nella sede selezionata. Aggiorna il magazzino.')
        # No filtro sulla sede storica: l'esemplare conserva i noleggi visibili
        # all'operatore anche dopo un trasferimento. RLS continua ad applicarsi.
        rentals = read_all(client, 'rental_booking_items', {
            'select': 'id,booking_id,delivered_at,is_legacy,booking:rental_bookings!inner(status,starts_on,created_at,is_legacy)',
            'booking.deleted_at': 'is.null',
            'rental_inventory_id': f'eq.{item_id}',
            'booking.status': 'in.(confirmed,preparing,active,completed,imported)',
            'booking.starts_on': f'lte.{now.date().isoformat()}',
            'order': 'id',
        })
        # Gli import storici conservano il codice, ma non assegnano esemplari attuali.
        # Il codice univoco permette di consultarne gli utilizzi senza alterare i riferimenti.
        rentals += read_all(client, 'rental_booking_items', {
            'select': 'id,booking_id,delivered_at,is_legacy,booking:rental_bookings!inner(status,starts_on,created_at,is_legacy)',
            'rental_inventory_id': 'is.null', 'is_legacy': 'eq.true', 'code_snapshot': historical_code_filter(item['code']),
            'booking.is_legacy': 'eq.true', 'booking.legacy_ready': 'eq.true',
            'booking.deleted_at': 'is.null', 'booking.status': 'eq.imported',
            'booking.starts_on': f'lte.{now.date().isoformat()}', 'order': 'id',
        })
        repairs = read_all(client, 'material_repairs', {
            'select': 'id,completed_at', 'rental_inventory_id': f'eq.{item_id}',
            'status': 'eq.completed', 'completed_at': f'lte.{now.isoformat()}', 'order': 'id',
        })
        last_repair = max((datetime.fromisoformat(row['completed_at']) for row in repairs), default=None)
        events = {}
        for row in rentals:
            booking = row['booking']
            if booking['status'] == 'cancelled' or booking['starts_on'] > now.date().isoformat():
                continue
            legacy = row.get('is_legacy') or booking.get('is_legacy') or booking['status'] == 'imported'
            if legacy:
                occurred = datetime.combine(datetime.fromisoformat(booking['starts_on']).date(), time.min, now.tzinfo)
            elif row['delivered_at']:
                occurred = datetime.fromisoformat(row['delivered_at'])
            else:
                # La consegna può non essere stata registrata. La data di creazione
                # distingue i noleggi confermati dopo una riparazione dello stesso giorno.
                start = datetime.combine(datetime.fromisoformat(booking['starts_on']).date(), time.min, now.tzinfo)
                occurred = max(start, datetime.fromisoformat(booking['created_at']))
            if occurred <= now:
                events[row['booking_id']] = occurred
        return {
            'item': item,
            'statistics': {
                'rental_count': len(events), 'repair_count': len({row['id'] for row in repairs}),
                'rentals_since_last_repair': sum(last_repair is None or event > last_repair for event in events.values()),
                'last_repair_at': last_repair,
            },
        }
    except httpx.HTTPError as error:
        raise HTTPException(503, 'Impossibile caricare la scheda e i conteggi dell’articolo.') from error
