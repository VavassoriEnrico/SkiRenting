from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class OperatorProfileRead(BaseModel):
    id: UUID
    created_at: datetime
    name: str


class LocationRead(BaseModel):
    id: UUID
    name: str


class OperatorSessionRead(BaseModel):
    profile: OperatorProfileRead
    locations: list[LocationRead]
