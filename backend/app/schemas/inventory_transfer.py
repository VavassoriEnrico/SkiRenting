from uuid import UUID

from pydantic import BaseModel, ConfigDict


class InventoryTransferCreate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    destination_location_id: UUID


class InventoryTransferRead(BaseModel):
    id: UUID
    code: str
    from_location_id: UUID
    to_location_id: UUID
