from datetime import date, datetime
from typing import Annotated, Literal
from uuid import UUID
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator


SkillLevel = Literal['beginner', 'intermediate', 'expert']
Code = Annotated[str, StringConstraints(pattern=r'^[A-Z]{2}$')]


class CustomerRead(BaseModel):
    id: UUID
    first_name: str
    last_name: str
    email: str | None = None
    phone: str | None = None
    notes: str | None = None
    birth_date: date | None = None
    skill_level: SkillLevel | None = None
    language: str | None = None
    country_code: str | None = None
    is_legacy: bool = False


class CustomerListRead(CustomerRead):
    booking_count: int = 0


Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class CustomerCreate(BaseModel):
    model_config = ConfigDict(extra='forbid')

    first_name: Name
    last_name: Name
    email: Annotated[str, Field(max_length=254, pattern=r'^[^\s@]+@[^\s@]+$')] | None = None
    phone: Annotated[str, Field(max_length=100)] | None = None
    notes: Annotated[str, Field(max_length=5000)] | None = None

    birth_date: date | None = None
    skill_level: SkillLevel | None = None
    language: Code | None = None
    country_code: Code | None = None

    @field_validator('email', 'phone', 'notes', 'birth_date', 'skill_level', 'language', 'country_code', mode='before')
    @classmethod
    def empty_to_none(cls, value):
        return (value.strip() or None) if isinstance(value, str) else value

    @field_validator('language', 'country_code', mode='before')
    @classmethod
    def normalize_code(cls, value):
        return (value.strip().upper() or None) if isinstance(value, str) else value

    @field_validator('skill_level', mode='before')
    @classmethod
    def normalize_level(cls, value):
        return (value.strip().lower() or None) if isinstance(value, str) else value

    @field_validator('birth_date')
    @classmethod
    def validate_birth_date(cls, value):
        if value and value > datetime.now(ZoneInfo('Europe/Rome')).date():
            raise ValueError('La data di nascita non può essere futura.')
        return value


class CustomerUpdate(CustomerCreate):
    # I nomi vuoti sono ammessi dal database solo per righe storiche.
    first_name: Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)] | None = None
    last_name: Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)] | None = None

    @field_validator('first_name', 'last_name')
    @classmethod
    def names_cannot_be_null(cls, value):
        if value is None:
            raise ValueError('Il nome non può essere null.')
        return value
