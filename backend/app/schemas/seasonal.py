from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.schemas.rental_booking import BookingPayment, RentalBookingRead
from app.schemas.rental_quote import QuoteItem, RentalQuoteRead
from app.schemas.rental_rate import Price, RateGroupRead


class SeasonRead(BaseModel):
    id: UUID
    name: str
    return_date: date
    is_current: bool
    created_at: datetime


class SeasonSave(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: UUID | None = None
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    return_date: date


class SeasonalSettings(BaseModel):
    seasons: list[SeasonRead]
    current_season: SeasonRead | None


class SeasonalPriceUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    single_price: Price | None
    pack_price: Price | None


class SeasonalRate(SeasonalPriceUpdate):
    id: UUID
    group_id: UUID
    group: RateGroupRead


class SeasonalRateList(BaseModel):
    rates: list[SeasonalRate]


class SeasonalBundle(BaseModel):
    model_config = ConfigDict(extra='forbid')
    main_id: UUID
    boot_id: UUID | None = None
    pole_id: UUID | None = None


class SeasonalQuoteRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    season_id: UUID
    starts_on: date
    inventory_ids: list[UUID] = Field(min_length=1)
    pole_quantity: int = Field(default=1, ge=1, le=1000, strict=True)

    @model_validator(mode='after')
    def unique_codes(self):
        if len(set(self.inventory_ids)) != len(self.inventory_ids):
            raise ValueError('Ogni esemplare può comparire una sola volta.')
        return self


class SeasonalQuoteItem(QuoteItem):
    price_mode: Literal['single','pack','included']
    pack_main_id: UUID | None = None


class SeasonalQuoteRead(RentalQuoteRead):
    season: SeasonRead
    bundles: list[SeasonalBundle]
    items: list[SeasonalQuoteItem]


class SeasonalBookingCreate(SeasonalQuoteRequest):
    booking_id: UUID
    customer_id: UUID
    expected_return_date: date
    expected_total: Decimal = Field(ge=0, decimal_places=2, allow_inf_nan=False)
    payment: BookingPayment | None = None
    notes: Annotated[str, StringConstraints(strip_whitespace=True, max_length=5000)] | None = None


class SeasonalBookingRead(RentalBookingRead):
    rental_kind: Literal['seasonal'] = 'seasonal'
