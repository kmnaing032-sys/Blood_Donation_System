from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.dependencies import get_db
from app.models.user import User
from app.core.permissions import require_roles
from app.services.dashboard_service import (
    get_dashboard_summary,
    get_donation_statistics,
    get_blood_stock_statistics,
    get_blood_request_statistics,
    get_monthly_donation_trends,
)
from app.schemas.dashboard import (
    DashboardSummaryResponse,
    DashboardDonationsResponse,
    DashboardBloodStockResponse,
    DashboardBloodRequestsResponse,
    DashboardMonthlyTrendsResponse,
)

router = APIRouter(
    prefix="/dashboard",
    tags=["Dashboard"],
)

# Protect all dashboard endpoints: Admin and Staff only
# Prevents unauthorized access or data leakage to ordinary users
dashboard_access = require_roles("admin", "staff")


# 1. SUMMARY: GET /api/v1/dashboard/summary
@router.get(
    "/summary",
    response_model=DashboardSummaryResponse,
)
async def read_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(dashboard_access),
):
    """
    Get real-time operational overview:
    Total users, donors, donations, stock ml, and request status counts.
    """
    return await get_dashboard_summary(db)


# 2. DONATIONS: GET /api/v1/dashboard/donations
@router.get(
    "/donations",
    response_model=DashboardDonationsResponse,
)
async def read_donation_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(dashboard_access),
):
    """
    Get donation metrics:
    Today's, this month's, this year's, all-time totals and blood group breakdowns.
    """
    return await get_donation_statistics(db)


# 3. BLOOD STOCK: GET /api/v1/dashboard/blood-stock
@router.get(
    "/blood-stock",
    response_model=DashboardBloodStockResponse,
)
async def read_blood_stock_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(dashboard_access),
):
    """
    Get inventory analytics:
    Volume per blood group, total available/reserved, low-stock, and out-of-stock alerts.
    """
    return await get_blood_stock_statistics(db)


# 4. BLOOD REQUESTS: GET /api/v1/dashboard/blood-requests
@router.get(
    "/blood-requests",
    response_model=DashboardBloodRequestsResponse,
)
async def read_blood_request_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(dashboard_access),
):
    """
    Get blood request analytics:
    Status counts (pending, approved, fulfilled, rejected, cancelled) and volumes grouped by blood group.
    """
    return await get_blood_request_statistics(db)


# 5. MONTHLY TRENDS: GET /api/v1/dashboard/monthly-trends
@router.get(
    "/monthly-trends",
    response_model=DashboardMonthlyTrendsResponse,
)
async def read_monthly_trends(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(dashboard_access),
):
    """
    Get historical monthly donation trends (volume and counts).
    """
    trends = await get_monthly_donation_trends(db)
    return {
        "trends": trends,
        "generated_at": datetime.now(timezone.utc),
    }

