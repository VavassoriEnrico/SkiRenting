from typing import Annotated
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends

from app.dependencies.auth import get_current_user_id, get_supabase_client
from app.schemas.operator import LocationRead, OperatorSessionRead
from app.services import operator_service

router = APIRouter(prefix="/me", tags=["operator"])
SupabaseClient = Annotated[httpx.Client, Depends(get_supabase_client)]
CurrentUserId = Annotated[UUID, Depends(get_current_user_id)]


@router.get("", response_model=OperatorSessionRead)
def read_current_operator(user_id: CurrentUserId, client: SupabaseClient):
    return operator_service.get_operator_session(client, user_id)


@router.get("/locations/{location_id}", response_model=LocationRead)
def read_authorized_location(location_id: UUID, user_id: CurrentUserId, client: SupabaseClient):
    return operator_service.get_authorized_location(client, user_id, location_id)
