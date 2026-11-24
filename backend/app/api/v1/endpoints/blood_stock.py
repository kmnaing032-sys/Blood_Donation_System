import math
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.dependencies import get_db
from app.models.user import User
from app.models.blood_stock import BloodStock
from app.core.auth_dependencies import get_current_user
from app.core.permissions import require_roles
from app.services.audit_service import create_audit_log
from app.crud.blood_stock import (
    ensure_all_blood_stocks_initialized,
    get_blood_stock_by_id,
    get_blood_stock_by_group,
    get_all_blood_stocks,
    update_blood_stock,
    get_stock_summary,
    ALL_BLOOD_GROUPS,
)
from app.schemas.blood_stock import (
    BloodStockUpdate,
    BloodStockResponse,
    BloodStockSummaryResponse,
    PaginatedBloodStockResponse,
)

router = APIRouter(
    prefix="/blood-stock",
    tags=["Blood Stock"],
)


def _format_stock_response(stock: BloodStock) -> BloodStockResponse:
    """Format BloodStock model into BloodStockResponse schema with calculated total volume."""
    return BloodStockResponse(
        id=stock.id,
        blood_group=stock.blood_group,
        available_quantity_ml=stock.available_quantity_ml,
        reserved_quantity_ml=stock.reserved_quantity_ml,
        total_quantity_ml=stock.available_quantity_ml + stock.reserved_quantity_ml,
        updated_at=stock.updated_at,
    )


# 1. SUMMARY: GET /api/v1/blood-stock/summary
@router.get(
    "/summary",
    response_model=BloodStockSummaryResponse,
)
async def read_stock_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get aggregate blood stock inventory summary across all 8 blood groups.
    - Accessible to all authenticated users (Admin, Staff, Donor/User).
    """
    summary = await get_stock_summary(db)
    return summary


# 2. LIST ALL STOCKS: GET /api/v1/blood-stock/
@router.get(
    "/",
    response_model=PaginatedBloodStockResponse,
)
async def list_blood_stocks(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(10, ge=1, le=100, description="Items per page"),
    blood_group: Optional[str] = Query(None, description="Filter by blood group (e.g. A+, O-)"),
    min_quantity: Optional[int] = Query(None, ge=0, description="Minimum available stock in ml"),
    max_quantity: Optional[int] = Query(None, ge=0, description="Maximum available stock in ml"),
    sort_by: str = Query("blood_group", description="Sort by field: blood_group, available_quantity_ml, reserved_quantity_ml, updated_at"),
    sort_order: str = Query("asc", description="Sort order: asc or desc"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retrieve paginated blood inventory levels with min/max stock filtering and quantity sorting.
    - Accessible to all authenticated users (read-only for regular users).
    """
    # Ensure all 8 blood groups exist
    await ensure_all_blood_stocks_initialized(db)

    skip = (page - 1) * page_size
    stocks, total = await get_all_blood_stocks(
        db=db,
        skip=skip,
        limit=page_size,
        blood_group=blood_group,
        min_quantity=min_quantity,
        max_quantity=max_quantity,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    total_pages = math.ceil(total / page_size) if total > 0 else 0

    return PaginatedBloodStockResponse(
        items=[_format_stock_response(s) for s in stocks],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


# 3. GET BY GROUP: GET /api/v1/blood-stock/group/{blood_group}
@router.get(
    "/group/{blood_group}",
    response_model=BloodStockResponse,
)
async def get_stock_by_blood_group(
    blood_group: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get stock levels for a specific blood group (e.g. O+, AB-).
    """
    if blood_group not in ALL_BLOOD_GROUPS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid blood group '{blood_group}'. Valid options: {', '.join(ALL_BLOOD_GROUPS)}",
        )

    stock = await get_blood_stock_by_group(db, blood_group)
    if not stock:
        await ensure_all_blood_stocks_initialized(db)
        stock = await get_blood_stock_by_group(db, blood_group)

    if not stock:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Stock for blood group '{blood_group}' not found",
        )

    return _format_stock_response(stock)


# 4. GET BY ID: GET /api/v1/blood-stock/{stock_id}
@router.get(
    "/{stock_id}",
    response_model=BloodStockResponse,
)
async def get_stock_by_id_endpoint(
    stock_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get blood stock record by unique ID.
    """
    stock = await get_blood_stock_by_id(db, stock_id)
    if not stock:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Blood stock record not found",
        )

    return _format_stock_response(stock)


# 5. UPDATE STOCK: PATCH /api/v1/blood-stock/{stock_id}
@router.patch(
    "/{stock_id}",
    response_model=BloodStockResponse,
)
async def modify_blood_stock(
    stock_id: int,
    stock_in: BloodStockUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    authorized_staff: User = Depends(require_roles("admin", "staff")),
):
    """
    Manually calibrate blood inventory levels (e.g., audits, expirations, discards).
    - Restricted to Admin and Staff only. Regular users cannot access (403 Forbidden).
    - Enforces non-negative volumes.
    """
    stock = await get_blood_stock_by_id(db, stock_id)
    if not stock:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Blood stock record not found",
        )

    old_avail = stock.available_quantity_ml
    old_res = stock.reserved_quantity_ml

    try:
        updated_stock = await update_blood_stock(db, stock, stock_in)
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve),
        )
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update blood stock: {str(e)}",
        )

    # Audit log
    ip_addr = request.client.host if request.client else None
    await create_audit_log(
        db=db,
        action="stock_adjusted",
        entity_type="blood_stock",
        entity_id=updated_stock.id,
        user_id=authorized_staff.id,
        description=(
            f"Blood stock {updated_stock.blood_group} adjusted by {authorized_staff.email}: "
            f"Available: {old_avail}ml -> {updated_stock.available_quantity_ml}ml, "
            f"Reserved: {old_res}ml -> {updated_stock.reserved_quantity_ml}ml"
        ),
        ip_address=ip_addr,
    )
    try:
        await db.commit()
    except Exception:
        await db.rollback()

    # Event hook: Generate notification for stock calibration
    try:
        from app.services.notification_service import notify_blood_stock_changed
        await notify_blood_stock_changed(db, updated_stock, acting_user=authorized_staff)
    except Exception:
        pass

    return _format_stock_response(updated_stock)

