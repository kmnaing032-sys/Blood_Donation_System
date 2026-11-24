from datetime import date, datetime
from typing import Literal
from pydantic import BaseModel, Field, ConfigDict, field_validator

from app.schemas.donor import BloodGroupType

DonationStatusType = Literal["pending", "completed", "cancelled", "rejected"]


class DonationBase(BaseModel):
    donor_id: int = Field(..., gt=0, description="Valid ID of the donor")
    donation_date: date = Field(..., description="Date on which the donation was made")
    quantity_ml: int = Field(..., gt=0, le=1000, description="Volume of blood donated in milliliters (typically 350-500ml, max 1000ml)")
    blood_group: BloodGroupType = Field(..., description="Valid blood group matching donor: A+, A-, B+, B-, AB+, AB-, O+, O-")
    status: DonationStatusType = Field(default="completed", description="Donation status: pending, completed, cancelled, rejected")
    notes: str | None = Field(default=None, max_length=1000, description="Optional clinical or administrative notes")

    @field_validator("donation_date")
    @classmethod
    def validate_donation_date(cls, v: date) -> date:
        if v > date.today():
            raise ValueError("Donation date cannot be in the future")
        return v

    @field_validator("quantity_ml")
    @classmethod
    def validate_quantity(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("Quantity must be greater than 0 ml")
        if v < 100 or v > 800:
            raise ValueError("Standard whole blood donation quantity must be between 100ml and 800ml")
        return v


class DonationCreate(DonationBase):
    pass


class DonationUpdate(BaseModel):
    donation_date: date | None = None
    quantity_ml: int | None = Field(default=None, gt=0, le=1000)
    status: DonationStatusType | None = None
    notes: str | None = Field(default=None, max_length=1000)

    @field_validator("donation_date")
    @classmethod
    def validate_donation_date(cls, v: date | None) -> date | None:
        if v is None:
            return v
        if v > date.today():
            raise ValueError("Donation date cannot be in the future")
        return v

    @field_validator("quantity_ml")
    @classmethod
    def validate_quantity(cls, v: int | None) -> int | None:
        if v is None:
            return v
        if v < 100 or v > 800:
            raise ValueError("Standard whole blood donation quantity must be between 100ml and 800ml")
        return v


class DonationResponse(BaseModel):
    id: int
    donor_id: int
    donor_name: str | None = None
    donor_phone: str | None = None
    donation_date: date
    quantity_ml: int
    blood_group: str
    status: str
    notes: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PaginatedDonationsResponse(BaseModel):
    items: list[DonationResponse]
    total: int
    page: int
    page_size: int
    total_pages: int

