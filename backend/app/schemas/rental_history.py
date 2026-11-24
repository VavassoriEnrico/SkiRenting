from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.customer import CustomerRead
from app.schemas.operator import LocationRead

BookingStatus = Literal['confirmed', 'preparing', 'active', 'completed', 'cancelled', 'imported']


class HistoryBookingRead(BaseModel):
    id: UUID
    booking_number: int
    customer_id: UUID | None
    location_id: UUID
    customer: CustomerRead
    hotel: LocationRead | None = None
    starts_on: date
    ends_on: date
    status: BookingStatus
    discount_percent: Decimal | None
    rental_kind: Literal['daily','seasonal','legacy'] = 'daily'
    is_legacy: bool = False
    legacy_paid_in_full: bool = False
    legacy_code: str | None = None
    legacy_customer_id: str | None = None
    legacy_hotel_name: str | None = None
    season_id: UUID | None = None
    promotion_id: UUID | None = None
    promotion_name: str | None = None
    notes: str | None = None
    created_by: UUID | None
    created_at: datetime
    updated_at: datetime
    item_count: int
    rental_formula: Literal['single','pack','mixed'] = 'single'
    returned_item_count: int
    subtotal: Decimal | None
    discount_amount: Decimal | None
    total: Decimal | None
    paid_amount: Decimal
    balance: Decimal | None


class HistoryItemRead(BaseModel):
    id: UUID
    rental_inventory_id: UUID | None
    code_snapshot: str
    brand_snapshot: str
    model_snapshot: str
    size_snapshot: str | None = None
    seasonal_pricing: Literal['single','pack','included'] | None = None
    seasonal_pack_main_id: UUID | None = None
    daily_price: Decimal | None = None
    amount: Decimal | None
    is_legacy: bool = False
    legacy_reported_paid_amount: Decimal | None = None
    legacy_returned_on: date | None = None
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
