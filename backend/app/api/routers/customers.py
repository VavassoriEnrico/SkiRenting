from uuid import UUID

from fastapi import APIRouter, Response, Request, HTTPException
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel

from app.services import customer_document_service

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


class CustomerDocumentRead(BaseModel):
    url: str | None


@router.get('/{customer_id}/document', response_model=CustomerDocumentRead)
def read_document(customer_id: UUID, user_id: CurrentUserId, client: SupabaseClient, response: Response):
    response.headers['Cache-Control'] = 'no-store'
    return customer_document_service.read_document(client, user_id, customer_id)


@router.put('/{customer_id}/document', response_model=CustomerDocumentRead)
async def upload_document(customer_id: UUID, request: Request, user_id: CurrentUserId, client: SupabaseClient, response: Response):
    response.headers['Cache-Control'] = 'no-store'
    content_type = request.headers.get('content-type', '').split(';')[0].lower()
    if content_type not in customer_document_service.IMAGE_EXTENSIONS:
        raise HTTPException(422, 'Seleziona una foto JPEG, PNG o WebP.')
    data = bytearray()
    async for chunk in request.stream():
        if len(data) + len(chunk) > customer_document_service.MAX_DOCUMENT_BYTES:
            raise HTTPException(413, 'La foto può occupare al massimo 5 MB.')
        data.extend(chunk)
    return await run_in_threadpool(customer_document_service.upload_document, client, user_id, customer_id, bytes(data), content_type)


@router.delete('/{customer_id}/document', response_model=CustomerDocumentRead)
def remove_document(customer_id: UUID, user_id: CurrentUserId, client: SupabaseClient, response: Response):
    response.headers['Cache-Control'] = 'no-store'
    return customer_document_service.delete_document(client, user_id, customer_id)
