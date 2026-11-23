from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.rental_inventory import CategoryRead

Price = Annotated[float, Field(ge=0, le=9999999999.99, multiple_of=0.01, allow_inf_nan=False)]


class RentalRateUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    daily_price_1_day: Price | None
    daily_price_2_days: Price | None
    daily_price_3_days: Price | None
    daily_price_4_days: Price | None
    daily_price_5_days: Price | None
    daily_price_6_days: Price | None
    daily_price_7_plus_days: Price | None
    pack_price_1_day: Price | None = None
    pack_price_2_days: Price | None = None
    pack_price_3_days: Price | None = None
    pack_price_4_days: Price | None = None
    pack_price_5_days: Price | None = None
    pack_price_6_days: Price | None = None
    pack_price_7_plus_days: Price | None = None


class RateGroupRead(BaseModel):
    id: UUID
    name: str
    category: CategoryRead


class RentalRateRead(RentalRateUpdate):
    model_config = ConfigDict(extra='ignore')
    id: UUID
    group_id: UUID
    group: RateGroupRead


class RentalRateList(BaseModel):
    categories: list[CategoryRead]
    rates: list[RentalRateRead]
