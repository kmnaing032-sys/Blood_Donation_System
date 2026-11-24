from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.dependencies import get_db
from app.models.user import User
from app.core.permissions import require_roles
from app.schemas.report import (
    DonorReportResponse,
    DonationReportResponse,
    BloodStockReportResponse,
    RequestReportResponse,
    OperationalOverviewResponse,
)
from app.crud.report import (
    get_donor_report,
    get_donation_report,
    get_blood_stock_report,
    get_blood_request_report,
    get_operational_overview,
)
from app.services.report_service import generate_reports_csv, generate_reports_pdf

router = APIRouter(prefix="/reports", tags=["Reports & Analytics"])


def validate_date_range(start_date: Optional[date], end_date: Optional[date]):
    if start_date and end_date and start_date > end_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_date cannot be after end_date",
        )


# 1. Operational Overview
@router.get(
    "/overview",
    response_model=OperationalOverviewResponse,
    summary="Get Operational Summary Report",
)
async def read_overview_report(
    start_date: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
    db: AsyncSession = Depends(get_db),
    authorized_user: User = Depends(require_roles("admin", "staff")),
):
    validate_date_range(start_date, end_date)
    return await get_operational_overview(db, start_date=start_date, end_date=end_date)


# 2. Donor Report
@router.get(
    "/donors",
    response_model=DonorReportResponse,
    summary="Get Donor Statistics Report",
)
async def read_donor_report(
    start_date: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
    blood_group: Optional[str] = Query(None, description="Filter by blood group"),
    db: AsyncSession = Depends(get_db),
    authorized_user: User = Depends(require_roles("admin", "staff")),
):
    validate_date_range(start_date, end_date)
    return await get_donor_report(db, start_date=start_date, end_date=end_date, blood_group=blood_group)


# 3. Donation Report
@router.get(
    "/donations",
    response_model=DonationReportResponse,
    summary="Get Donation Statistics Report",
)
async def read_donation_report(
    start_date: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
    blood_group: Optional[str] = Query(None, description="Filter by blood group"),
    status: Optional[str] = Query(None, description="Filter by donation status"),
    db: AsyncSession = Depends(get_db),
    authorized_user: User = Depends(require_roles("admin", "staff")),
):
    validate_date_range(start_date, end_date)
    return await get_donation_report(
        db, start_date=start_date, end_date=end_date, blood_group=blood_group, status=status
    )


# 4. Blood Stock Report
@router.get(
    "/blood-stock",
    response_model=BloodStockReportResponse,
    summary="Get Blood Stock Inventory Report",
)
async def read_blood_stock_report(
    blood_group: Optional[str] = Query(None, description="Filter by blood group"),
    db: AsyncSession = Depends(get_db),
    authorized_user: User = Depends(require_roles("admin", "staff")),
):
    return await get_blood_stock_report(db, blood_group=blood_group)


# 5. Blood Request Report
@router.get(
    "/blood-requests",
    response_model=RequestReportResponse,
    summary="Get Blood Request Statistics Report",
)
async def read_blood_request_report(
    start_date: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
    blood_group: Optional[str] = Query(None, description="Filter by blood group"),
    status: Optional[str] = Query(None, description="Filter by request status"),
    db: AsyncSession = Depends(get_db),
    authorized_user: User = Depends(require_roles("admin", "staff")),
):
    validate_date_range(start_date, end_date)
    return await get_blood_request_report(
        db, start_date=start_date, end_date=end_date, blood_group=blood_group, status=status
    )


# 6. Export to CSV
@router.get(
    "/export/csv",
    summary="Export Report to CSV",
)
async def export_report_csv(
    report_type: str = Query("overview", description="Type: overview, donors, donations, blood-stock, blood-requests"),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    blood_group: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    authorized_user: User = Depends(require_roles("admin", "staff")),
):
    validate_date_range(start_date, end_date)
    csv_content = await generate_reports_csv(
        db, report_type, start_date=start_date, end_date=end_date, blood_group=blood_group, status=status
    )
    filename = f"{report_type}_report_{date.today().isoformat()}.csv"
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# 7. Export to PDF
@router.get(
    "/export/pdf",
    summary="Export Report to PDF",
)
async def export_report_pdf(
    report_type: str = Query("overview", description="Type: overview, donors, donations, blood-stock, blood-requests"),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    blood_group: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    authorized_user: User = Depends(require_roles("admin", "staff")),
):
    validate_date_range(start_date, end_date)
    pdf_bytes = await generate_reports_pdf(
        db, report_type, start_date=start_date, end_date=end_date, blood_group=blood_group, status=status
    )
    filename = f"{report_type}_report_{date.today().isoformat()}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
