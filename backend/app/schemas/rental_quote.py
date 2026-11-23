from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class RentalQuoteRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    starts_on: date
    ends_on: date
    inventory_ids: list[UUID] = Field(min_length=1)
    hotel_id: UUID | None = None

    @model_validator(mode='after')
    def validate_selection(self):
        if self.ends_on < self.starts_on:
            raise ValueError('Il rientro non può precedere la data di inizio.')
        if len(self.inventory_ids) != len(set(self.inventory_ids)):
            raise ValueError('Un esemplare non può essere selezionato due volte.')
        return self


class QuoteItem(BaseModel):
    inventory_id: UUID
    code: str
    brand: str
    model: str
    group_name: str
    daily_price: Decimal | None
    amount: Decimal | None


class QuoteHotel(BaseModel):
    id: UUID
    name: str


class QuotePromotion(BaseModel):
    id: UUID
    name: str


class RentalQuoteRead(BaseModel):
    promotion: QuotePromotion | None = None
    starts_on: date
    ends_on: date
    days: int
    items: list[QuoteItem]
    hotel: QuoteHotel | None
    discount_percent: Decimal
    subtotal: Decimal | None
    discount_amount: Decimal | None
    total: Decimal | None
    missing_rate_codes: list[str]
