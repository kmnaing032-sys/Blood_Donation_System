from datetime import date, datetime
from typing import Literal
from pydantic import BaseModel, Field, ConfigDict, field_validator
import re


BloodGroupType = Literal["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]
GenderType = Literal["male", "female", "other"]


def calculate_age(born: date) -> int:
    today = date.today()
    return today.year - born.year - ((today.month, today.day) < (born.month, born.day))


class DonorBase(BaseModel):
    phone: str = Field(
        ...,
        min_length=7,
        max_length=20,
        description="Phone number with optional country code (+ or digits)",
    )
    date_of_birth: date = Field(..., description="Date of birth (donor must be between 18 and 65 years old)")
    gender: GenderType = Field(..., description="Gender (male, female, other)")
    blood_group: BloodGroupType = Field(..., description="Valid blood group: A+, A-, B+, B-, AB+, AB-, O+, O-")
    address: str = Field(..., min_length=5, max_length=500, description="Contact/Residential address")

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        clean = v.strip()
        # Allows optional '+' followed by digits, spaces, hyphens, parentheses
        if not re.match(r"^\+?[0-9\s\-()]{7,20}$", clean):
            raise ValueError("Invalid phone number format")
        return clean

    @field_validator("date_of_birth")
    @classmethod
    def validate_age_limit(cls, v: date) -> date:
        today = date.today()
        if v >= today:
            raise ValueError("Date of birth must be in the past")
        age = calculate_age(v)
        if age < 18:
            raise ValueError("Donor must be at least 18 years old")
        if age > 65:
            raise ValueError("Donor age cannot exceed 65 years for standard blood donation eligibility")
        return v


class DonorCreate(DonorBase):
    user_id: int | None = Field(
        default=None,
        description="User ID to associate this donor profile with. Admins/Staff can specify, or defaults to current user.",
    )


class DonorUpdate(BaseModel):
    phone: str | None = Field(
        default=None,
        min_length=7,
        max_length=20,
    )
    date_of_birth: date | None = None
    gender: GenderType | None = None
    blood_group: BloodGroupType | None = None
    address: str | None = Field(
        default=None,
        min_length=5,
        max_length=500,
    )
    last_donation_date: date | None = None

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str | None) -> str | None:
        if v is None:
            return v
        clean = v.strip()
        if not re.match(r"^\+?[0-9\s\-()]{7,20}$", clean):
            raise ValueError("Invalid phone number format")
        return clean

    @field_validator("date_of_birth")
    @classmethod
    def validate_age_limit(cls, v: date | None) -> date | None:
        if v is None:
            return v
        today = date.today()
        if v >= today:
            raise ValueError("Date of birth must be in the past")
        age = calculate_age(v)
        if age < 18:
            raise ValueError("Donor must be at least 18 years old")
        if age > 65:
            raise ValueError("Donor age cannot exceed 65 years for standard blood donation eligibility")
        return v

    @field_validator("last_donation_date")
    @classmethod
    def validate_last_donation_date(cls, v: date | None) -> date | None:
        if v is None:
            return v
        if v > date.today():
            raise ValueError("Last donation date cannot be in the future")
        return v


# Full Donor Profile Response (Admins, Staff, or the Owner Donor)
class DonorResponse(BaseModel):
    id: int
    user_id: int
    full_name: str | None = None
    email: str | None = None
    phone: str
    date_of_birth: date
    age: int
    gender: str
    blood_group: str
    address: str
    last_donation_date: date | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# Public / Masked Donor Response (for regular users searching available blood donors)
class PublicDonorResponse(BaseModel):
    id: int
    blood_group: str
    gender: str
    age: int
    last_donation_date: date | None = None
    # Address is truncated or city-level only for privacy, phone is masked for public search
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# Paginated wrapper
class PaginatedDonorsResponse(BaseModel):
    items: list[DonorResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class PaginatedPublicDonorsResponse(BaseModel):
    items: list[PublicDonorResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class BulkDonorActionRequest(BaseModel):
    donor_ids: list[int] = Field(
        ...,
        min_length=1,
        max_length=100,
        description="List of donor IDs to operate on (max 100)",
    )
    action: Literal["activate", "deactivate", "delete"] = Field(
        ...,
        description="Batch operation: activate, deactivate, or delete",
    )


class BulkDonorActionResponse(BaseModel):
    requested_count: int
    successful_count: int
    failed_count: int
    action: str
    message: str
    failed_ids: list[int] = Field(default_factory=list)


