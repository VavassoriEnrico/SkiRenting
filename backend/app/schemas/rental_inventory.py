from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator


class CategoryRead(BaseModel):
    id: UUID
    code: str
    name: str


class GroupRead(BaseModel):
    id: UUID
    name: str


class LengthDetails(BaseModel):
    length_cm: float | None = None
    radius_m: float | None = None
    style: str | None = None


class BootDetails(BaseModel):
    size_label: str | None = None
    size_system: str
    shoe_size_eu: str | None = None
    foot_length_cm: float | None = None
    sole_length_mm: int | None = None


class HelmetDetails(BaseModel):
    size_label: str | None = None
    color: str | None = None


class PoleDetails(BaseModel):
    height_cm: float | None = None


class GoggleDetails(BaseModel):
    lens: str | None = None


class AccessoryDetails(BaseModel):
    size_label: str | None = None


class VariantRead(BaseModel):
    id: UUID
    brand: str
    model: str
    year: int | None = None
    notes: str | None = None
    category: CategoryRead
    ski_details: LengthDetails | None = None
    snowboard_details: LengthDetails | None = None
    boot_details: BootDetails | None = None
    helmet_details: HelmetDetails | None = None
    pole_details: PoleDetails | None = None
    goggle_details: GoggleDetails | None = None
    accessory_details: AccessoryDetails | None = None


class RentalItemRead(BaseModel):
    id: UUID
    code: str
    serial_number: str | None = None
    purchase_price: float | None = None
    legacy_sold_price: float | None = None
    status: Literal['active', 'maintenance', 'retired', 'sold', 'lost']
    is_rentable: bool
    is_bookable: bool
    notes: str | None = None
    group: GroupRead
    variant: VariantRead


class RentalInventoryRead(BaseModel):
    categories: list[CategoryRead]
    items: list[RentalItemRead]


# Inserimento: gli ID esistenti sono alternativi ai dati per creare nuove voci.
Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
DetailType = Literal['ski', 'snowboard', 'boots', 'helmet', 'poles', 'goggles', 'accessory']


class CreateModel(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)


class NewCategory(CreateModel):
    name: Text
    code: Annotated[str, StringConstraints(pattern=r'^[a-z][a-z0-9_]{0,59}$')]
    detail_type: DetailType


class NewDetails(CreateModel):
    length_cm: float | None = Field(default=None, gt=0, le=9999.99)
    radius_m: float | None = Field(default=None, gt=0, le=9999.99)
    style: Text | None = None
    size_label: Text | None = None
    size_system: Literal['unknown', 'mondopoint', 'eu', 'uk', 'us'] | None = None
    shoe_size_eu: Text | None = None
    foot_length_cm: float | None = Field(default=None, gt=0, le=999.99)
    sole_length_mm: int | None = Field(default=None, gt=0, le=32767)
    color: Text | None = None
    height_cm: float | None = Field(default=None, gt=0, le=9999.99)
    lens: Text | None = None


class NewVariant(CreateModel):
    brand: Text
    model: Text
    year: int | None = Field(default=None, ge=1900, le=9999)
    notes: str | None = Field(default=None, max_length=5000)
    details: NewDetails


class RentalItemCreate(CreateModel):
    category_id: UUID | None = None
    new_category: NewCategory | None = None
    group_id: UUID | None = None
    new_group: Text | None = None
    variant_id: UUID | None = None
    new_variant: NewVariant | None = None
    code: Text
    serial_number: Text | None = None
    status: Literal['active', 'maintenance', 'retired', 'sold', 'lost'] = 'active'
    is_rentable: bool = True
    is_bookable: bool = True
    purchase_price: Annotated[float, Field(ge=0, le=9999999999.99)] | None = None
    legacy_sold_price: Annotated[float, Field(ge=0, le=9999999999.99)] | None = None
    notes: str | None = Field(default=None, max_length=5000)

    @model_validator(mode='after')
    def validate_choices(self):
        for existing, new in [
            (self.category_id, self.new_category),
            (self.group_id, self.new_group),
            (self.variant_id, self.new_variant),
        ]:
            if (existing is None) == (new is None):
                raise ValueError('Scegli una voce esistente oppure compilane una nuova.')
        if self.new_category and (self.group_id or self.variant_id):
            raise ValueError('Una nuova categoria richiede un nuovo gruppo e modello.')
        return self


class CatalogGroupRead(GroupRead):
    category_id: UUID


class CatalogCategoryRead(CategoryRead):
    detail_type: DetailType


class RentalCatalogRead(BaseModel):
    categories: list[CatalogCategoryRead]
    groups: list[CatalogGroupRead]
    variants: list[VariantRead]


class RentalItemCreated(BaseModel):
    id: UUID
    category_id: UUID
    group_id: UUID
    variant_id: UUID
    code: str
