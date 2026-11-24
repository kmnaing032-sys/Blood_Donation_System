from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field, ConfigDict, field_validator

from app.schemas.donor import BloodGroupType


class BloodStockBase(BaseModel):
    blood_group: BloodGroupType = Field(..., description="Valid blood group: A+, A-, B+, B-, AB+, AB-, O+, O-")
    available_quantity_ml: int = Field(default=0, ge=0, description="Available blood in milliliters (>= 0)")
    reserved_quantity_ml: int = Field(default=0, ge=0, description="Reserved blood in milliliters (>= 0)")


class BloodStockCreate(BloodStockBase):
    pass


class BloodStockUpdate(BaseModel):
    available_quantity_ml: int | None = Field(default=None, ge=0, description="New available volume in ml")
    reserved_quantity_ml: int | None = Field(default=None, ge=0, description="New reserved volume in ml")


class BloodStockResponse(BaseModel):
    id: int
    blood_group: str
    available_quantity_ml: int
    reserved_quantity_ml: int
    total_quantity_ml: int
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class BloodStockSummaryItem(BaseModel):
    blood_group: str
    available_ml: int
    reserved_ml: int
    total_ml: int
    status: Literal["critical", "low", "normal", "sufficient"]


class BloodStockSummaryResponse(BaseModel):
    total_available_ml: int
    total_reserved_ml: int
    total_inventory_ml: int
    stock_by_group: list[BloodStockSummaryItem]


class PaginatedBloodStockResponse(BaseModel):
    items: list[BloodStockResponse]
    total: int
    page: int
    page_size: int
    total_pages: int

