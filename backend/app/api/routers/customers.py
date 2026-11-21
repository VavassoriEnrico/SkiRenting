from fastapi import APIRouter

from app.api.routers.operator import CurrentUserId, SupabaseClient
from app.schemas.customer import CustomerCreate, CustomerRead
from app.services import customer_service

router = APIRouter(prefix='/customers', tags=['customers'])


@router.get('', response_model=list[CustomerRead])
def read_customers(user_id: CurrentUserId, client: SupabaseClient):
    return customer_service.list_customers(client, user_id)


@router.post('', response_model=CustomerRead, status_code=201)
def create_customer(data: CustomerCreate, user_id: CurrentUserId, client: SupabaseClient):
    return customer_service.create_customer(client, user_id, data)
