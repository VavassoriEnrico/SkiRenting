from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator


class CustomerRead(BaseModel):
    id: UUID
    first_name: str
    last_name: str
    email: str | None = None
    phone: str | None = None
    notes: str | None = None


Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class CustomerCreate(BaseModel):
    model_config = ConfigDict(extra='forbid')

    first_name: Name
    last_name: Name
    email: Annotated[str, Field(max_length=254, pattern=r'^[^\s@]+@[^\s@]+$')] | None = None
    phone: Annotated[str, Field(max_length=100)] | None = None
    notes: Annotated[str, Field(max_length=5000)] | None = None

    @field_validator('email', 'phone', 'notes', mode='before')
    @classmethod
    def empty_to_none(cls, value):
        return (value.strip() or None) if isinstance(value, str) else value
