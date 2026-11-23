from datetime import date, datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

Weekday = Annotated[int, Field(strict=True, ge=1, le=7)]


class PromotionCreate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    promotion_date: date | None = None
    starts_on: date | None = None
    ends_on: date | None = None
    weekdays: list[Weekday] = Field(default_factory=list, max_length=7)
    discount_percent: float = Field(ge=0, le=100, multiple_of=0.01, allow_inf_nan=False)

    @model_validator(mode='after')
    def check_schedule(self):
        if (self.starts_on is None) != (self.ends_on is None):
            raise ValueError('Indica entrambe le date del periodo.')
        has_period = self.starts_on is not None and self.ends_on is not None
        if sum((self.promotion_date is not None, bool(self.weekdays), has_period)) != 1:
            raise ValueError('Scegli una data singola, i giorni della settimana oppure un periodo.')
        if has_period and self.ends_on < self.starts_on:
            raise ValueError('La fine del periodo non può precedere l’inizio.')
        if len(set(self.weekdays)) != len(self.weekdays):
            raise ValueError('I giorni della settimana devono essere distinti.')
        self.weekdays = sorted(self.weekdays)
        return self


class PromotionRead(BaseModel):
    id: UUID
    name: str
    created_at: datetime
    promotion_date: date | None
    starts_on: date | None = None
    ends_on: date | None = None
    weekdays: list[int]
    discount_percent: float
    is_active: bool
