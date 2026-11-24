from datetime import datetime, date
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field, ConfigDict


# -------------------------------------------------------------
# Donor Reports
# -------------------------------------------------------------
class DonorGroupCount(BaseModel):
    blood_group: str
    count: int


class DonorGenderCount(BaseModel):
    gender: str
    count: int


class DonorReportResponse(BaseModel):
    total_donors: int
    by_blood_group: List[DonorGroupCount]
    by_gender: List[DonorGenderCount]
    new_donors_in_period: int
    start_date: Optional[date] = None
    end_date: Optional[date] = None

    model_config = ConfigDict(from_attributes=True)


# -------------------------------------------------------------
# Donation Reports
# -------------------------------------------------------------
class DonationGroupVolume(BaseModel):
    blood_group: str
    count: int
    total_volume_ml: int


class DonationPeriodTrend(BaseModel):
    period: str  # e.g., '2026-11' or '2026-11-20'
    count: int
    volume_ml: int


class DonationReportResponse(BaseModel):
    total_donations: int
    total_volume_ml: int
    by_blood_group: List[DonationGroupVolume]
    trends: List[DonationPeriodTrend]
    start_date: Optional[date] = None
    end_date: Optional[date] = None

    model_config = ConfigDict(from_attributes=True)


# -------------------------------------------------------------
# Blood Stock Reports
# -------------------------------------------------------------
class BloodStockGroupReport(BaseModel):
    blood_group: str
    available_quantity_ml: int
    reserved_quantity_ml: int
    total_quantity_ml: int
    percentage_of_total: float


class BloodStockReportResponse(BaseModel):
    total_available_volume_ml: int
    total_reserved_volume_ml: int
    total_inventory_volume_ml: int
    by_blood_group: List[BloodStockGroupReport]
    low_stock_groups: List[str]
    critical_stock_groups: List[str]

    model_config = ConfigDict(from_attributes=True)


# -------------------------------------------------------------
# Blood Request Reports
# -------------------------------------------------------------
class RequestStatusCount(BaseModel):
    status: str
    count: int


class RequestGroupCount(BaseModel):
    blood_group: str
    count: int
    total_quantity_ml: int


class RequestUrgencyCount(BaseModel):
    urgency: str
    count: int


class RequestReportResponse(BaseModel):
    total_requests: int
    by_status: List[RequestStatusCount]
    by_blood_group: List[RequestGroupCount]
    by_urgency: List[RequestUrgencyCount]
    pending_count: int
    approved_count: int
    fulfilled_count: int
    rejected_count: int
    cancelled_count: int
    start_date: Optional[date] = None
    end_date: Optional[date] = None

    model_config = ConfigDict(from_attributes=True)


# -------------------------------------------------------------
# Operational Summary / Overview Report
# -------------------------------------------------------------
class OperationalOverviewResponse(BaseModel):
    total_donors: int
    new_donors_in_period: int
    total_donations: int
    total_donated_volume_ml: int
    total_available_stock_ml: int
    total_requests: int
    pending_requests: int
    fulfilled_requests: int
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    generated_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = ConfigDict(from_attributes=True)
