from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.rental_inventory import RentalItemRead


class RentalItemStatistics(BaseModel):
    rental_count: int = Field(ge=0)
    repair_count: int = Field(ge=0)
    rentals_since_last_repair: int = Field(ge=0)
    last_repair_at: datetime | None = None


class RentalItemDetailsRead(BaseModel):
    item: RentalItemRead
    statistics: RentalItemStatistics
