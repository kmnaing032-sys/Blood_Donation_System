from datetime import datetime
from typing import List, Dict, Optional
from pydantic import BaseModel, ConfigDict


class DashboardSummaryResponse(BaseModel):
    total_users: int
    total_donors: int
    total_donations: int
    total_blood_stock_ml: int
    total_reserved_stock_ml: int
    pending_requests: int
    approved_requests: int
    fulfilled_requests: int
    rejected_requests: int
    cancelled_requests: int
    generated_at: datetime


class GroupStat(BaseModel):
    blood_group: str
    count: int
    total_volume_ml: int = 0


class MonthlyTrend(BaseModel):
    month: str  # YYYY-MM
    donation_count: int
    total_volume_ml: int


class DashboardDonationsResponse(BaseModel):
    today_count: int
    today_volume_ml: int
    this_month_count: int
    this_month_volume_ml: int
    this_year_count: int
    this_year_volume_ml: int
    all_time_count: int
    all_time_volume_ml: int
    by_blood_group: List[GroupStat]
    generated_at: datetime


class BloodStockGroupDetail(BaseModel):
    blood_group: str
    available_quantity_ml: int
    reserved_quantity_ml: int
    total_quantity_ml: int
    status: str  # "out_of_stock", "low_stock", "adequate", "sufficient"


class DashboardBloodStockResponse(BaseModel):
    total_available_ml: int
    total_reserved_ml: int
    total_inventory_ml: int
    stocks_by_group: List[BloodStockGroupDetail]
    low_stock_alerts: List[str]   # e.g., ["A-", "O-"]
    out_of_stock_alerts: List[str] # e.g., ["B-"]
    generated_at: datetime


class RequestGroupStat(BaseModel):
    blood_group: str
    request_count: int
    total_requested_ml: int


class DashboardBloodRequestsResponse(BaseModel):
    total_requests: int
    pending_requests: int
    approved_requests: int
    fulfilled_requests: int
    rejected_requests: int
    cancelled_requests: int
    by_blood_group: List[RequestGroupStat]
    generated_at: datetime


class DashboardMonthlyTrendsResponse(BaseModel):
    trends: List[MonthlyTrend]
    generated_at: datetime

