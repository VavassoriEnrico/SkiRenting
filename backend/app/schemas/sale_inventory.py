from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.operator import LocationRead
from app.schemas.rental_inventory import CategoryRead, VariantRead


class SaleStockRead(BaseModel):
    id: UUID
    quantity: int = Field(ge=0)
    price: float | None = Field(default=None, ge=0)
    notes: str | None = None
    location: LocationRead
    variant: VariantRead


class GeneralSaleInventoryRead(BaseModel):
    categories: list[CategoryRead]
    locations: list[LocationRead]
    items: list[SaleStockRead]
