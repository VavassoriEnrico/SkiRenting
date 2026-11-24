from typing import Annotated, Literal
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator
from app.schemas.operator import LocationRead


class CategoryRead(BaseModel):
    id: UUID
    code: str
    name: str


class GroupRead(BaseModel):
    id: UUID
    name: str


class LengthDetails(BaseModel):
    length_cm: float | None = None


class BootDetails(BaseModel):
    size_label: str | None = None


class HelmetDetails(BaseModel):
    size_label: str | None = None


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
    category: CategoryRead
    ski_details: LengthDetails | None = None
    snowboard_details: LengthDetails | None = None
    boot_details: BootDetails | None = None
    helmet_details: HelmetDetails | None = None
    pole_details: PoleDetails | None = None
    goggle_details: GoggleDetails | None = None
    accessory_details: AccessoryDetails | None = None


class OpenRepairRead(BaseModel):
    id: UUID
    repair_type: Literal['edges','wax','edges_and_wax','other']
    sent_at: datetime


class RentalItemRead(BaseModel):
    is_generic: bool = False
    open_repair: OpenRepairRead | None = None
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


class RentalInventorySummary(BaseModel):
    currently_rented: int = Field(ge=0)
    currently_in_repair: int = Field(ge=0)


class RentalInventoryRead(BaseModel):
    summary: RentalInventorySummary | None = None
    categories: list[CategoryRead]
    items: list[RentalItemRead]


class GeneralRentalItemRead(RentalItemRead):
    is_currently_rented: bool
    location: LocationRead


class GeneralRentalInventoryRead(BaseModel):
    summary: RentalInventorySummary
    categories: list[CategoryRead]
    locations: list[LocationRead]
    items: list[GeneralRentalItemRead]


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
    size_label: Text | None = None
    height_cm: float | None = Field(default=None, gt=0, le=9999.99)
    lens: Text | None = None


class NewVariant(CreateModel):
    brand: Text
    model: Text
    year: int | None = Field(default=None, ge=1900, le=9999)
    details: NewDetails


class RentalMaterialCreate(CreateModel):
    category_id: UUID | None = None
    new_category: NewCategory | None = None
    group_id: UUID | None = None
    new_group: Text | None = None
    variant_id: UUID | None = None
    new_variant: NewVariant | None = None
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


class RentalItemCreate(RentalMaterialCreate):
    code: Text
    serial_number: Text | None = None


class RentalArrivalUnit(CreateModel):
    code: Text
    serial_number: Text | None = None


class RentalArrivalCreate(RentalMaterialCreate):
    request_id: UUID
    units: list[RentalArrivalUnit] = Field(min_length=1, max_length=500)

    @model_validator(mode='after')
    def unique_codes(self):
        if len({unit.code.casefold() for unit in self.units}) != len(self.units):
            raise ValueError('Ogni esemplare deve avere un codice diverso.')
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


class RentalItemsArchive(CreateModel):
    item_ids: list[UUID] = Field(min_length=1, max_length=500)


class RentalItemsArchived(BaseModel):
    item_ids: list[UUID]


class RentalArrivalRead(BaseModel):
    id: UUID
    quantity: int
    items: list[RentalItemCreated] = Field(min_length=1)


class RetiredRentalItemRead(RentalItemRead):
    location: LocationRead
    deleted_at: datetime | None = None
    deleted_by: UUID | None = None


class RetiredRentalInventoryRead(BaseModel):
    categories: list[CategoryRead]
    locations: list[LocationRead]
    items: list[RetiredRentalItemRead]


class RentalItemReactivated(BaseModel):
    id: UUID
    code: str
    location_id: UUID
