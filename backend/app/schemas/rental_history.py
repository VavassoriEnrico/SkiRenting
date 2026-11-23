from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.customer import CustomerRead
from app.schemas.operator import LocationRead

BookingStatus = Literal['confirmed', 'preparing', 'active', 'completed', 'cancelled']


class HistoryBookingRead(BaseModel):
    id: UUID
    booking_number: int
    customer_id: UUID
    location_id: UUID
    customer: CustomerRead
    hotel: LocationRead | None = None
    starts_on: date
    ends_on: date
    status: BookingStatus
    discount_percent: Decimal
    rental_kind: Literal['daily','seasonal'] = 'daily'
    season_id: UUID | None = None
    promotion_id: UUID | None = None
    promotion_name: str | None = None
    notes: str | None = None
    created_by: UUID
    created_at: datetime
    updated_at: datetime
    item_count: int
    rental_formula: Literal['single','pack','mixed'] = 'single'
    returned_item_count: int
    subtotal: Decimal
    discount_amount: Decimal
    total: Decimal
    paid_amount: Decimal
    balance: Decimal


class HistoryItemRead(BaseModel):
    id: UUID
    rental_inventory_id: UUID
    code_snapshot: str
    brand_snapshot: str
    model_snapshot: str
    size_snapshot: str | None = None
    seasonal_pricing: Literal['single','pack','included'] | None = None
    seasonal_pack_main_id: UUID | None = None
    daily_price: Decimal | None = None
    amount: Decimal
    delivered_at: datetime | None = None
    returned_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class HistoryPaymentRead(BaseModel):
    id: UUID
    payment_method: str
    amount: Decimal
    paid_at: datetime
    created_by: UUID
    notes: str | None = None
    created_at: datetime


class HistoryBookingDetails(HistoryBookingRead):
    items: list[HistoryItemRead]
    payments: list[HistoryPaymentRead]


class RentalReturnCreate(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    request_id: UUID
    booking_id: UUID | None = None
    code: str = Field(min_length=1, max_length=200)


class ReturnBookingRead(BaseModel):
    id: UUID
    booking_number: int
    customer: CustomerRead
    starts_on: date
    ends_on: date
    status: BookingStatus
    notes: str | None = None
    items: list[HistoryItemRead]
    total: Decimal
    paid_amount: Decimal
    balance: Decimal


class TodayReturnsRead(BaseModel):
    due_on: date
    bookings: list[ReturnBookingRead]
