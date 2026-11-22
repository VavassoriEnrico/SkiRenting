from datetime import date, datetime
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from app.schemas.rental_quote import RentalQuoteRequest


class BookingPayment(BaseModel):
    model_config = ConfigDict(extra='forbid')
    amount: Decimal = Field(gt=0, le=Decimal('9999999999.99'), decimal_places=2, allow_inf_nan=False)
    payment_method: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    paid_at_local: datetime
    notes: str | None = Field(default=None, max_length=5000)

    @field_validator('paid_at_local')
    @classmethod
    def local_time_only(cls, value):
        if value.tzinfo is not None:
            raise ValueError('Indicare data e ora locali italiane.')
        return value


class RentalPaymentCreate(BookingPayment):
    payment_id: UUID


class RentalBookingCreate(RentalQuoteRequest):
    booking_id: UUID
    customer_id: UUID
    expected_total: Decimal = Field(ge=0, decimal_places=2, allow_inf_nan=False)
    payment: BookingPayment | None = None
    notes: str | None = Field(default=None, max_length=5000)

    @field_validator('notes', mode='before')
    @classmethod
    def clean_notes(cls, value):
        return (value.strip() or None) if isinstance(value, str) else value


class RentalBookingRead(BaseModel):
    id: UUID
    booking_number: int
    starts_on: date
    ends_on: date
    status: str
    total: Decimal
    paid_amount: Decimal
    balance: Decimal
    notes: str | None = None
