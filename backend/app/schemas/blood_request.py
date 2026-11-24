from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field, ConfigDict, field_validator
import re

from app.schemas.donor import BloodGroupType

RequestUrgencyType = Literal["low", "normal", "high", "critical"]
RequestStatusType = Literal["pending", "approved", "rejected", "fulfilled", "cancelled"]


class BloodRequestBase(BaseModel):
    patient_name: str = Field(..., min_length=2, max_length=150, description="Full name of the patient requiring blood")
    hospital_name: str = Field(..., min_length=2, max_length=200, description="Name of the hospital or clinic")
    hospital_address: str = Field(..., min_length=5, max_length=500, description="Full hospital address / city / ward")
    blood_group: BloodGroupType = Field(..., description="Required blood group: A+, A-, B+, B-, AB+, AB-, O+, O-")
    quantity_ml: int = Field(..., gt=0, le=5000, description="Requested volume in milliliters (typically 100ml to 5000ml)")
    urgency: RequestUrgencyType = Field(default="normal", description="Urgency level: low, normal, high, critical")
    contact_phone: str = Field(..., min_length=7, max_length=20, description="Contact phone number for request verification")
    required_by: datetime | None = Field(default=None, description="Target datetime by which blood is required")
    notes: str | None = Field(default=None, max_length=1000, description="Clinical indications or additional notes")

    @field_validator("contact_phone")
    @classmethod
    def validate_contact_phone(cls, v: str) -> str:
        clean = v.strip()
        if not re.match(r"^\+?[0-9\s\-()]{7,20}$", clean):
            raise ValueError("Invalid contact phone number format")
        return clean

    @field_validator("quantity_ml")
    @classmethod
    def validate_quantity(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("Quantity requested must be greater than 0 ml")
        if v > 5000:
            raise ValueError("Quantity cannot exceed 5000 ml per request")
        return v


class BloodRequestCreate(BloodRequestBase):
    pass


class BloodRequestUpdate(BaseModel):
    patient_name: str | None = Field(default=None, min_length=2, max_length=150)
    hospital_name: str | None = Field(default=None, min_length=2, max_length=200)
    hospital_address: str | None = Field(default=None, min_length=5, max_length=500)
    quantity_ml: int | None = Field(default=None, gt=0, le=5000)
    urgency: RequestUrgencyType | None = None
    contact_phone: str | None = Field(default=None, min_length=7, max_length=20)
    required_by: datetime | None = None
    notes: str | None = Field(default=None, max_length=1000)

    @field_validator("contact_phone")
    @classmethod
    def validate_contact_phone(cls, v: str | None) -> str | None:
        if v is None:
            return v
        clean = v.strip()
        if not re.match(r"^\+?[0-9\s\-()]{7,20}$", clean):
            raise ValueError("Invalid contact phone number format")
        return clean


class BloodRequestStatusAction(BaseModel):
    notes: str | None = Field(default=None, max_length=1000, description="Reason / clinical notes for the status change")


class BloodRequestResponse(BaseModel):
    id: int
    user_id: int | None = None
    patient_name: str
    hospital_name: str
    hospital_address: str
    blood_group: str
    quantity_ml: int
    urgency: str
    status: str
    contact_phone: str
    required_by: datetime | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PaginatedBloodRequestsResponse(BaseModel):
    items: list[BloodRequestResponse]
    total: int
    page: int
    page_size: int
    total_pages: int

