from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel

from app.schemas.customer import CustomerRead


class CustomerBookingRead(BaseModel):
    id: UUID
    booking_number: int
    location_id: UUID
    location_name: str
    starts_on: date
    ends_on: date
    total: Decimal | None
    paid_amount: Decimal
    is_legacy: bool = False
    legacy_code: str | None = None


class CustomerBookingsRead(BaseModel):
    customer: CustomerRead
    booking_count: int
    bookings: list[CustomerBookingRead]
