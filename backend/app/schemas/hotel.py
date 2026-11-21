from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

Discount = Annotated[float, Field(ge=0, le=100, multiple_of=0.01, allow_inf_nan=False)]


class HotelRead(BaseModel):
    id: UUID
    name: str
    is_active: bool
    discount: float = 0


class HotelCreate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    discount: Discount = 0


class HotelDiscountUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    discount: Discount
