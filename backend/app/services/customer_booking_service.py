from uuid import UUID

import httpx
from fastapi import HTTPException

from app.repositories import customer_repository, rental_history_repository
from app.services.operator_service import get_operator_session
from app.services.rental_history_service import enrich, history_error


def read_customer_bookings(client: httpx.Client, user_id: UUID, customer_id: UUID):
    operator = get_operator_session(client, user_id)
    locations = {str(location.id): location.name for location in operator.locations}
    try:
        customer = customer_repository.get_customer(client, customer_id)
        if customer is None:
            raise HTTPException(404, 'Cliente non trovato o già eliminato.')
        headers = rental_history_repository.get_customer_headers(client, customer_id, list(locations))
        items, payments = rental_history_repository.get_children(client, headers)
        bookings = [{**row, 'location_name': locations[str(row['location_id'])]}
                    for row in enrich(headers, items, payments, details=False)]
        return {'customer': customer, 'booking_count': len(bookings), 'bookings': bookings}
    except httpx.HTTPError as error:
        raise history_error(error) from error
