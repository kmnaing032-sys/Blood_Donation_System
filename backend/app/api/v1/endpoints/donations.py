import math
from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database.dependencies import get_db
from app.models.user import User
from app.models.donor import Donor
from app.models.donation import Donation
from app.core.auth_dependencies import get_current_user
from app.core.permissions import require_roles
from app.services.audit_service import create_audit_log
from app.crud.donor import get_donor_by_id, get_donor_by_user_id
from app.crud.donation import (
    create_donation,
    get_donation_by_id,
    get_all_donations,
    update_donation,
    delete_donation,
    check_donor_eligibility,
)
from app.schemas.donation import (
    DonationCreate,
    DonationUpdate,
    DonationResponse,
    PaginatedDonationsResponse,
)

router = APIRouter(
    prefix="/donations",
    tags=["Donations"],
)


async def _enrich_donation_response(
    db: AsyncSession,
    donation: Donation,
    current_user: User,
) -> DonationResponse:
    """Helper to populate donor information and apply privacy masking when needed."""
    donor = await get_donor_by_id(db, donation.donor_id)
    user = None
    if donor:
        u_res = await db.execute(select(User).where(User.id == donor.user_id))
        user = u_res.scalar_one_or_none()

    # Mask phone/name for unauthorized viewers if any
    is_privileged = current_user.role in ["admin", "staff"] or (donor and donor.user_id == current_user.id)
    return DonationResponse(
        id=donation.id,
        donor_id=donation.donor_id,
        donor_name=user.full_name if (user and is_privileged) else None,
        donor_phone=donor.phone if (donor and is_privileged) else None,
        donation_date=donation.donation_date,
        quantity_ml=donation.quantity_ml,
        blood_group=donation.blood_group,
        status=donation.status,
        notes=donation.notes if is_privileged else None,
        created_at=donation.created_at,
        updated_at=donation.updated_at,
    )


# 1. RECORD A DONATION: POST /api/v1/donations/
@router.post(
    "/",
    response_model=DonationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def record_donation(
    donation_in: DonationCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Record a new blood donation.
    - RBAC: Admin and Staff can record donations for any valid donor.
    - Donors can record or submit their own donation record.
    - Validates:
      1. Donor exists.
      2. Donation blood group matches donor's registered blood group.
      3. Donor eligibility (minimum interval of 56 days between whole blood donations & age).
      4. Single atomic transaction integration with Blood Stock.
    """
    donor = await get_donor_by_id(db, donation_in.donor_id)
    if not donor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Donor not found with the specified ID",
        )

    # Permission check: Admin/Staff or the donor themselves
    if current_user.role not in ["admin", "staff"] and donor.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to record donations for another donor",
        )

    # Verify blood group match
    if donation_in.blood_group != donor.blood_group:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Blood group mismatch: submitted donation is '{donation_in.blood_group}', "
                f"but donor is registered as '{donor.blood_group}'"
            ),
        )

    # Check eligibility rules if marking as completed
    if donation_in.status == "completed":
        eligible, reason = await check_donor_eligibility(db, donor, donation_in.donation_date)
        if not eligible:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=reason,
            )

    try:
        new_donation = await create_donation(
            db=db,
            donor=donor,
            donation_data=donation_in,
        )
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to record donation and update stock: {str(e)}",
        )

    # Audit log
    ip_addr = request.client.host if request.client else None
    await create_audit_log(
        db=db,
        action="donation_created",
        entity_type="donation",
        entity_id=new_donation.id,
        user_id=current_user.id,
        description=f"Donation of {new_donation.quantity_ml}ml ({new_donation.blood_group}) recorded for donor ID {donor.id}",
        ip_address=ip_addr,
    )
    try:
        await db.commit()
    except Exception:
        await db.rollback()

    # Event hook: Generate notification for donation recorded
    try:
        from app.services.notification_service import notify_donation_created
        await notify_donation_created(db, new_donation, acting_user=current_user)
    except Exception:
        pass

    return await _enrich_donation_response(db, new_donation, current_user)


# 2. LIST DONATIONS: GET /api/v1/donations/
@router.get(
    "/",
    response_model=PaginatedDonationsResponse,
)
async def list_donations(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(10, ge=1, le=100, description="Items per page"),
    donor_id: Optional[int] = Query(None, description="Filter by donor ID"),
    blood_group: Optional[str] = Query(None, description="Filter by blood group"),
    donation_date: Optional[date] = Query(None, description="Filter by donation date"),
    status: Optional[str] = Query(None, description="Filter by status (pending, completed, etc.)"),
    search: Optional[str] = Query(None, description="Search across donor full name or notes"),
    sort_by: str = Query("donation_date", description="Sort by field: donation_date, created_at, updated_at, quantity_ml, status"),
    sort_order: str = Query("desc", description="Sort order: asc or desc"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List donations with pagination, searching, and filtering.
    - Admin & Staff: Full access to all donation records.
    - Regular User/Donor: Filtered to view their own donation records only.
    """
    # If regular user, restrict query to their own donor ID
    effective_donor_id = donor_id
    if current_user.role not in ["admin", "staff"]:
        user_donor = await get_donor_by_user_id(db, current_user.id)
        if not user_donor:
            # User has no donor profile, return empty list
            return PaginatedDonationsResponse(
                items=[],
                total=0,
                page=page,
                page_size=page_size,
                total_pages=0,
            )
        effective_donor_id = user_donor.id

    skip = (page - 1) * page_size
    donations, total = await get_all_donations(
        db=db,
        skip=skip,
        limit=page_size,
        donor_id=effective_donor_id,
        blood_group=blood_group,
        donation_date=donation_date,
        status=status,
        search=search,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    total_pages = math.ceil(total / page_size) if total > 0 else 0

    items = [await _enrich_donation_response(db, d, current_user) for d in donations]
    return PaginatedDonationsResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


# 3. GET SINGLE DONATION: GET /api/v1/donations/{donation_id}
@router.get(
    "/{donation_id}",
    response_model=DonationResponse,
)
async def get_donation(
    donation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retrieve single donation record by ID.
    - Admin & Staff can view any donation.
    - Regular users can only view their own donation.
    """
    donation = await get_donation_by_id(db, donation_id)
    if not donation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Donation not found",
        )

    # Permission check for regular user
    if current_user.role not in ["admin", "staff"]:
        donor = await get_donor_by_id(db, donation.donor_id)
        if not donor or donor.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to view this donation record",
            )

    return await _enrich_donation_response(db, donation, current_user)


# 4. UPDATE DONATION: PATCH /api/v1/donations/{donation_id}
@router.patch(
    "/{donation_id}",
    response_model=DonationResponse,
)
async def modify_donation(
    donation_id: int,
    update_in: DonationUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "staff")),
):
    """
    Update donation record (e.g. status transition from pending -> completed or adjusting quantity).
    - Restricted to Admin and Staff.
    - Automatically updates blood stock in the same transaction.
    """
    donation = await get_donation_by_id(db, donation_id)
    if not donation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Donation not found",
        )

    donor = await get_donor_by_id(db, donation.donor_id)
    if not donor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Associated donor not found",
        )

    # If transitioning to completed, check eligibility
    if update_in.status == "completed" and donation.status != "completed":
        target_date = update_in.donation_date or donation.donation_date
        eligible, reason = await check_donor_eligibility(db, donor, target_date)
        if not eligible:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=reason,
            )

    try:
        updated_donation = await update_donation(
            db=db,
            donation=donation,
            donor=donor,
            update_data=update_in,
        )
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve),
        )
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update donation: {str(e)}",
        )

    ip_addr = request.client.host if request.client else None
    await create_audit_log(
        db=db,
        action="donation_updated",
        entity_type="donation",
        entity_id=updated_donation.id,
        user_id=current_user.id,
        description=f"Donation ID {updated_donation.id} updated (Status: {updated_donation.status})",
        ip_address=ip_addr,
    )
    try:
        await db.commit()
    except Exception:
        await db.rollback()

    return await _enrich_donation_response(db, updated_donation, current_user)


# 5. DELETE DONATION: DELETE /api/v1/donations/{donation_id}
@router.delete(
    "/{donation_id}",
)
async def remove_donation(
    donation_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_roles("admin")),
):
    """
    Delete a donation record and reconcile blood stock.
    - Restricted to Admin only.
    """
    donation = await get_donation_by_id(db, donation_id)
    if not donation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Donation not found",
        )

    try:
        await delete_donation(db, donation)
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve),
        )
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete donation: {str(e)}",
        )

    ip_addr = request.client.host if request.client else None
    await create_audit_log(
        db=db,
        action="donation_deleted",
        entity_type="donation",
        entity_id=donation_id,
        user_id=admin_user.id,
        description=f"Donation ID {donation_id} deleted and inventory reconciled by admin {admin_user.email}",
        ip_address=ip_addr,
    )
    try:
        await db.commit()
    except Exception:
        await db.rollback()

    return {
        "message": "Donation record deleted successfully and blood stock reconciled"
    }

