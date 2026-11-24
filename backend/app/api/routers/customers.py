from uuid import UUID

from fastapi import APIRouter, Response

from app.api.routers.operator import CurrentUserId, SupabaseClient
from app.schemas.customer import CustomerCreate, CustomerListRead, CustomerRead, CustomerUpdate
from app.services import customer_service
from app.schemas.customer_bookings import CustomerBookingsRead
from app.services.customer_booking_service import read_customer_bookings

router = APIRouter(prefix='/customers', tags=['customers'])


@router.get('', response_model=list[CustomerListRead])
def read_customers(user_id: CurrentUserId, client: SupabaseClient):
    return customer_service.list_customers(client, user_id)


@router.post('', response_model=CustomerRead, status_code=201)
def create_customer(data: CustomerCreate, user_id: CurrentUserId, client: SupabaseClient):
    return customer_service.create_customer(client, user_id, data)


@router.patch('/{customer_id}', response_model=CustomerRead)
def update_customer(customer_id: UUID, data: CustomerUpdate, user_id: CurrentUserId, client: SupabaseClient):
    return customer_service.update_customer(client, user_id, customer_id, data)


@router.delete('/{customer_id}', status_code=204)
def delete_customer(customer_id: UUID, user_id: CurrentUserId, client: SupabaseClient):
    customer_service.delete_customer(client, user_id, customer_id)
    return Response(status_code=204)


@router.get('/{customer_id}/bookings', response_model=CustomerBookingsRead)
def customer_bookings(customer_id: UUID, user_id: CurrentUserId, client: SupabaseClient):
    return read_customer_bookings(client, user_id, customer_id)
