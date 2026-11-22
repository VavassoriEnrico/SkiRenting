from decimal import Decimal
from uuid import UUID

import httpx


def confirm_booking(client: httpx.Client, location_id: UUID, booking_id: UUID, data: dict) -> dict:
    response = client.post('/rest/v1/rpc/skirenting_confirm_rental_booking', json={
        'p_location_id': str(location_id), 'p_booking_id': str(booking_id), 'p_data': data,
    })
    response.raise_for_status()
    return response.json(parse_float=Decimal)


def register_payment(client: httpx.Client, location_id: UUID, booking_id: UUID, payment_id: UUID, data: dict):
    response = client.post('/rest/v1/rpc/skirenting_register_rental_payment', json={
        'p_location_id': str(location_id), 'p_booking_id': str(booking_id),
        'p_payment_id': str(payment_id), 'p_data': data,
    })
    response.raise_for_status()
    return response.json()
