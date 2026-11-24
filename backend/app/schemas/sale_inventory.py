from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.schemas.operator import LocationRead
from app.schemas.rental_inventory import CategoryRead, CatalogCategoryRead, CreateModel, NewVariant, Text, VariantRead


class SaleVariantDetailsRead(BaseModel):
    category_label: str | None = None


class SaleVariantRead(VariantRead):
    sale_details: SaleVariantDetailsRead | None = None


class SaleStockRead(BaseModel):
    id: UUID
    quantity: int = Field(ge=0)
    price: float | None = Field(default=None, ge=0)
    notes: str | None = None
    location: LocationRead
    variant: SaleVariantRead


class GeneralSaleInventoryRead(BaseModel):
    categories: list[CategoryRead]
    locations: list[LocationRead]
    items: list[SaleStockRead]


class SaleCatalogRead(BaseModel):
    categories: list[CatalogCategoryRead]
    variants: list[SaleVariantRead]


class NewSaleVariant(NewVariant):
    category_label: Text | None = None


class SaleArrivalCreate(CreateModel):
    request_id: UUID
    category_id: UUID
    variant_id: UUID | None = None
    new_variant: NewSaleVariant | None = None
    quantity: int = Field(ge=1, le=1000000, strict=True)
    price: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    purchase_price: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    received_on: date
    notes: str | None = Field(default=None, max_length=5000)

    @model_validator(mode='after')
    def one_variant(self):
        if (self.variant_id is None) == (self.new_variant is None):
            raise ValueError('Seleziona un modello esistente oppure compilane uno nuovo.')
        return self


class SaleArrivalRead(BaseModel):
    id: UUID
    inventory_id: UUID
    variant_id: UUID
    category_id: UUID
    quantity_added: int
    quantity: int
    price: float | None
