from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from app.schemas.rental_inventory import RentalItemRead

RepairType = Literal['edges','wax','edges_and_wax','other']


class RepairCreate(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    repair_id: UUID
    code: Annotated[str, StringConstraints(min_length=1,max_length=200)]
    repair_type: RepairType
    notes: str | None = Field(default=None,max_length=5000)


class RepairComplete(BaseModel):
    model_config = ConfigDict(extra='forbid')
    rental_inventory_id: UUID


class RepairCreated(BaseModel):
    id: UUID
    rental_inventory_id: UUID


class RepairRead(BaseModel):
    id: UUID
    rental_inventory_id: UUID
    repair_type: RepairType
    sent_at: datetime
    notes: str | None = None
    item: RentalItemRead
