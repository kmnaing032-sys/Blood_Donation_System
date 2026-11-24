import csv
import io
import math
from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status, Request
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database.dependencies import get_db
from app.models.user import User
from app.models.donor import Donor
from app.core.auth_dependencies import get_current_user
from app.core.permissions import require_roles
from app.services.audit_service import create_audit_log
from app.crud.user import get_user_by_id
from app.crud.donor import (
    create_donor,
    get_donor_by_id,
    get_donor_by_user_id,
    get_donor_by_phone,
    get_all_donors,
    update_donor,
    delete_donor,
)
from app.schemas.donor import (
    DonorCreate,
    DonorUpdate,
    DonorResponse,
    PublicDonorResponse,
    PaginatedDonorsResponse,
    PaginatedPublicDonorsResponse,
    BulkDonorActionRequest,
    BulkDonorActionResponse,
    calculate_age,
)
from app.models.donation import Donation

router = APIRouter(
    prefix="/donors",
    tags=["Donors"],
)


def _build_donor_response(donor: Donor, user: Optional[User]) -> DonorResponse:
    """Helper to enrich DonorResponse with User details and calculated age."""
    return DonorResponse(
        id=donor.id,
        user_id=donor.user_id,
        full_name=user.full_name if user else None,
        email=user.email if user else None,
        phone=donor.phone,
        date_of_birth=donor.date_of_birth,
        age=calculate_age(donor.date_of_birth),
        gender=donor.gender,
        blood_group=donor.blood_group,
        address=donor.address,
        last_donation_date=donor.last_donation_date,
        created_at=donor.created_at,
        updated_at=donor.updated_at,
    )


def _build_public_donor_response(donor: Donor) -> PublicDonorResponse:
    """Helper to build privacy-conscious public donor response."""
    return PublicDonorResponse(
        id=donor.id,
        blood_group=donor.blood_group,
        gender=donor.gender,
        age=calculate_age(donor.date_of_birth),
        last_donation_date=donor.last_donation_date,
        created_at=donor.created_at,
    )


# 1. CREATE DONOR: POST /api/v1/donors/
@router.post(
    "/",
    response_model=DonorResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_donor_profile(
    donor_in: DonorCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Register a new donor profile.
    - Admins and Staff can register a profile for any user_id specified.
    - Regular users can register a profile for themselves.
    - Validates against duplicate user donor profiles and duplicate phone numbers.
    """
    target_user_id = current_user.id
    if donor_in.user_id is not None:
        if current_user.role not in ["admin", "staff"] and donor_in.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only staff or administrators can register donor profiles for other users",
            )
        target_user_id = donor_in.user_id

    # Verify target user exists
    target_user = await get_user_by_id(db, target_user_id)
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Specified user does not exist",
        )

    # Check for existing profile for target user
    existing_user_donor = await get_donor_by_user_id(db, target_user_id)
    if existing_user_donor:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A donor profile already exists for this user",
        )

    # Check duplicate phone
    existing_phone = await get_donor_by_phone(db, donor_in.phone)
    if existing_phone:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A donor with this phone number is already registered",
        )

    new_donor = await create_donor(db, donor_in, target_user_id)

    # Audit log
    ip_addr = request.client.host if request.client else None
    await create_audit_log(
        db=db,
        action="donor_created",
        entity_type="donor",
        entity_id=new_donor.id,
        user_id=current_user.id,
        description=f"Donor profile created for user ID {target_user_id} (Blood Group: {new_donor.blood_group})",
        ip_address=ip_addr,
    )
    try:
        await db.commit()
    except Exception:
        await db.rollback()

    # Event hook: Generate notification for donor registration
    try:
        from app.services.notification_service import notify_donor_registered
        await notify_donor_registered(db, new_donor, acting_user=current_user)
    except Exception:
        # Logging or silent continuation so business workflow remains resilient
        pass

    return _build_donor_response(new_donor, target_user)


# 2. LIST DONORS (PAGINATED & SEARCHABLE): GET /api/v1/donors/
@router.get("/")
async def list_donors(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(10, ge=1, le=100, description="Items per page"),
    search: Optional[str] = Query(None, description="Search across full name, email, phone, or address"),
    name: Optional[str] = Query(None, description="Filter specifically by donor full name"),
    email: Optional[str] = Query(None, description="Filter specifically by email address"),
    phone: Optional[str] = Query(None, description="Filter specifically by phone number"),
    blood_group: Optional[str] = Query(None, description="Filter by blood group (e.g. A+, O-)"),
    gender: Optional[str] = Query(None, description="Filter by gender"),
    is_active: Optional[bool] = Query(None, description="Filter by account activation status (true/false)"),
    min_age: Optional[int] = Query(None, ge=0, description="Filter by minimum age in years"),
    max_age: Optional[int] = Query(None, ge=0, description="Filter by maximum age in years"),
    start_date: Optional[date] = Query(None, description="Registration start date (YYYY-MM-DD)"),
    end_date: Optional[date] = Query(None, description="Registration end date (YYYY-MM-DD)"),
    last_donation_from: Optional[date] = Query(None, description="Last donation start date (YYYY-MM-DD)"),
    last_donation_to: Optional[date] = Query(None, description="Last donation end date (YYYY-MM-DD)"),
    sort_by: str = Query("created_at", description="Field to sort by: created_at, updated_at, blood_group, date_of_birth, last_donation_date, name, email, phone"),
    sort_order: str = Query("desc", description="Sort order: asc or desc"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List donors with advanced filtering, searching, sorting, and pagination.
    - Admins and Staff receive full contact and identity details (DonorResponse).
    - Regular users receive public/privacy-masked donor details (PublicDonorResponse).
    """
    if start_date and end_date and start_date > end_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_date cannot be after end_date",
        )
    if last_donation_from and last_donation_to and last_donation_from > last_donation_to:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="last_donation_from cannot be after last_donation_to",
        )
    if min_age is not None and max_age is not None and min_age > max_age:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="min_age cannot be greater than max_age",
        )

    skip = (page - 1) * page_size
    donors, total = await get_all_donors(
        db=db,
        skip=skip,
        limit=page_size,
        search=search,
        name=name,
        email=email,
        phone=phone,
        blood_group=blood_group,
        gender=gender,
        is_active=is_active,
        min_age=min_age,
        max_age=max_age,
        start_date=start_date,
        end_date=end_date,
        last_donation_from=last_donation_from,
        last_donation_to=last_donation_to,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    total_pages = math.ceil(total / page_size) if total > 0 else 0

    # Admin and Staff: Full Response
    if current_user.role in ["admin", "staff"]:
        user_ids = [d.user_id for d in donors]
        user_map = {}
        if user_ids:
            u_res = await db.execute(select(User).where(User.id.in_(user_ids)))
            user_map = {u.id: u for u in u_res.scalars().all()}

        items = [_build_donor_response(d, user_map.get(d.user_id)) for d in donors]
        return PaginatedDonorsResponse(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        )

    # Regular Users: Masked Public Response
    items = [_build_public_donor_response(d) for d in donors]
    return PaginatedPublicDonorsResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


def _sanitize_csv_cell(value: any) -> str:
    """
    Mitigate CSV Formula Injection by prepending a single quote
    if string begins with '=', '+', '-', or '@'.
    """
    if value is None:
        return ""
    val_str = str(value)
    if val_str and val_str[0] in ("=", "+", "-", "@"):
        return f"'{val_str}"
    return val_str


# 3. EXPORT FILTERED DONORS: GET /api/v1/donors/export
@router.get(
    "/export",
    summary="Export Filtered Donors to CSV",
)
async def export_donors_csv(
    search: Optional[str] = Query(None, description="Search across full name, email, phone, or address"),
    name: Optional[str] = Query(None, description="Filter specifically by donor full name"),
    email: Optional[str] = Query(None, description="Filter specifically by email address"),
    phone: Optional[str] = Query(None, description="Filter specifically by phone number"),
    blood_group: Optional[str] = Query(None, description="Filter by blood group (e.g. A+, O-)"),
    gender: Optional[str] = Query(None, description="Filter by gender"),
    is_active: Optional[bool] = Query(None, description="Filter by account activation status (true/false)"),
    min_age: Optional[int] = Query(None, ge=0, description="Filter by minimum age in years"),
    max_age: Optional[int] = Query(None, ge=0, description="Filter by maximum age in years"),
    start_date: Optional[date] = Query(None, description="Registration start date (YYYY-MM-DD)"),
    end_date: Optional[date] = Query(None, description="Registration end date (YYYY-MM-DD)"),
    last_donation_from: Optional[date] = Query(None, description="Last donation start date (YYYY-MM-DD)"),
    last_donation_to: Optional[date] = Query(None, description="Last donation end date (YYYY-MM-DD)"),
    sort_by: str = Query("created_at", description="Field to sort by"),
    sort_order: str = Query("desc", description="Sort order: asc or desc"),
    db: AsyncSession = Depends(get_db),
    authorized_user: User = Depends(require_roles("admin", "staff")),
):
    """
    Export donors matching search and filter criteria to CSV.
    - Restricted to Staff and Admins.
    - Excludes sensitive fields (passwords, tokens, keys).
    - Protects against CSV formula injection.
    """
    if start_date and end_date and start_date > end_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_date cannot be after end_date",
        )
    if last_donation_from and last_donation_to and last_donation_from > last_donation_to:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="last_donation_from cannot be after last_donation_to",
        )
    if min_age is not None and max_age is not None and min_age > max_age:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="min_age cannot be greater than max_age",
        )

    # Fetch donors up to 5000 records for safe export
    donors, _ = await get_all_donors(
        db=db,
        skip=0,
        limit=5000,
        search=search,
        name=name,
        email=email,
        phone=phone,
        blood_group=blood_group,
        gender=gender,
        is_active=is_active,
        min_age=min_age,
        max_age=max_age,
        start_date=start_date,
        end_date=end_date,
        last_donation_from=last_donation_from,
        last_donation_to=last_donation_to,
        sort_by=sort_by,
        sort_order=sort_order,
    )

    user_ids = [d.user_id for d in donors]
    user_map = {}
    if user_ids:
        u_res = await db.execute(select(User).where(User.id.in_(user_ids)))
        user_map = {u.id: u for u in u_res.scalars().all()}

    output = io.StringIO()
    writer = csv.writer(output)

    # Safe Headers (Excluding password_hash, tokens, internal salts)
    writer.writerow([
        "Donor ID",
        "Full Name",
        "Email",
        "Phone",
        "Blood Group",
        "Gender",
        "Age",
        "Date of Birth",
        "Address",
        "Account Status",
        "Last Donation Date",
        "Registered At",
    ])

    for donor in donors:
        user = user_map.get(donor.user_id)
        age = calculate_age(donor.date_of_birth)
        status_label = "Active" if (user and user.is_active) else "Inactive"

        writer.writerow([
            _sanitize_csv_cell(donor.id),
            _sanitize_csv_cell(user.full_name if user else "N/A"),
            _sanitize_csv_cell(user.email if user else "N/A"),
            _sanitize_csv_cell(donor.phone),
            _sanitize_csv_cell(donor.blood_group),
            _sanitize_csv_cell(donor.gender),
            _sanitize_csv_cell(age),
            _sanitize_csv_cell(donor.date_of_birth.isoformat() if donor.date_of_birth else ""),
            _sanitize_csv_cell(donor.address),
            _sanitize_csv_cell(status_label),
            _sanitize_csv_cell(donor.last_donation_date.isoformat() if donor.last_donation_date else "None"),
            _sanitize_csv_cell(donor.created_at.strftime("%Y-%m-%d %H:%M:%S") if donor.created_at else ""),
        ])

    filename = f"donors_export_{date.today().isoformat()}.csv"
    csv_bytes = output.getvalue().encode("utf-8")

    return Response(
        content=csv_bytes,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# 4. GET SINGLE DONOR: GET /api/v1/donors/{donor_id}
@router.get("/{donor_id}")
async def get_donor(
    donor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get a donor profile by ID.
    - Admin, Staff, or profile owner: Full details (DonorResponse).
    - Other users: Public/masked details (PublicDonorResponse).
    """
    donor = await get_donor_by_id(db, donor_id)
    if not donor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Donor not found",
        )

    # Admin, Staff, or the Owner
    if current_user.role in ["admin", "staff"] or current_user.id == donor.user_id:
        user = await get_user_by_id(db, donor.user_id)
        return _build_donor_response(donor, user)

    # Other regular users: Public view
    return _build_public_donor_response(donor)


# 4. UPDATE DONOR: PATCH /api/v1/donors/{donor_id}
@router.patch(
    "/{donor_id}",
    response_model=DonorResponse,
)
async def update_donor_profile(
    donor_id: int,
    donor_in: DonorUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Update donor profile.
    - Admin and Staff can update any donor.
    - Donors can update their own profile.
    - Checks for phone conflicts.
    """
    donor = await get_donor_by_id(db, donor_id)
    if not donor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Donor not found",
        )

    # Permission check: Admin, Staff, or Owner
    if current_user.role not in ["admin", "staff"] and current_user.id != donor.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to update this donor profile",
        )

    # Check phone uniqueness if phone is changing
    if donor_in.phone is not None and donor_in.phone != donor.phone:
        existing_phone = await get_donor_by_phone(db, donor_in.phone)
        if existing_phone and existing_phone.id != donor.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A donor with this phone number is already registered",
            )

    updated = await update_donor(db, donor, donor_in)

    ip_addr = request.client.host if request.client else None
    await create_audit_log(
        db=db,
        action="donor_updated",
        entity_type="donor",
        entity_id=updated.id,
        user_id=current_user.id,
        description=f"Donor profile ID {updated.id} updated by user {current_user.email}",
        ip_address=ip_addr,
    )
    try:
        await db.commit()
    except Exception:
        await db.rollback()

    user = await get_user_by_id(db, updated.user_id)
    return _build_donor_response(updated, user)


# 5. DELETE DONOR: DELETE /api/v1/donors/{donor_id}
@router.delete(
    "/{donor_id}",
)
async def remove_donor(
    donor_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_roles("admin")),
):
    """
    Delete a donor profile.
    - Restricted to Admin only.
    """
    donor = await get_donor_by_id(db, donor_id)
    if not donor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Donor not found",
        )

    ip_addr = request.client.host if request.client else None
    await create_audit_log(
        db=db,
        action="donor_deleted",
        entity_type="donor",
        entity_id=donor_id,
        user_id=admin_user.id,
        description=f"Donor profile ID {donor_id} deleted by administrator {admin_user.email}",
        ip_address=ip_addr,
    )

    await delete_donor(db, donor)
    return {
        "message": "Donor profile deleted successfully"
    }


# 6. BULK DONOR ACTIONS: POST /api/v1/donors/bulk-actions
@router.post(
    "/bulk-actions",
    response_model=BulkDonorActionResponse,
    status_code=status.HTTP_200_OK,
)
async def bulk_donor_actions(
    payload: BulkDonorActionRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "staff")),
):
    """
    Perform batch operations on donors:
    - 'activate': bulk activate linked donor user accounts (staff / admin)
    - 'deactivate': bulk deactivate linked donor user accounts (staff / admin)
    - 'delete': bulk delete donor profiles (admin only)
    """
    action = payload.action
    raw_ids = payload.donor_ids

    # Normalize & deduplicate IDs preserving order
    donor_ids = list(dict.fromkeys(raw_ids))
    if not donor_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Donor IDs list cannot be empty.",
        )

    # RBAC check for destructive delete action
    if action == "delete" and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators are authorized to perform bulk donor deletions.",
        )

    # Fetch donors with user records
    stmt = select(Donor, User).outerjoin(User, Donor.user_id == User.id).where(Donor.id.in_(donor_ids))
    result = await db.execute(stmt)
    records = result.all()

    found_map = {d.id: (d, u) for d, u in records}
    missing_ids = [d_id for d_id in donor_ids if d_id not in found_map]

    if missing_ids:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"One or more donor records were not found: {missing_ids}",
        )

    ip_addr = request.client.host if request.client else None
    successful_count = 0
    failed_count = 0
    failed_ids = []

    if action in ("activate", "deactivate"):
        target_state = (action == "activate")
        for d_id in donor_ids:
            donor, user = found_map[d_id]
            if user:
                user.is_active = target_state
            successful_count += 1

        await create_audit_log(
            db=db,
            action=f"bulk_donor_{action}",
            entity_type="donor",
            user_id=current_user.id,
            description=f"Bulk {action} executed on {successful_count} donor(s) by {current_user.email}: {donor_ids}",
            ip_address=ip_addr,
        )
        await db.commit()

        msg = f"Successfully {'activated' if target_state else 'deactivated'} {successful_count} donor account(s)."
        return BulkDonorActionResponse(
            requested_count=len(donor_ids),
            successful_count=successful_count,
            failed_count=0,
            action=action,
            message=msg,
            failed_ids=[],
        )

    elif action == "delete":
        # Check foreign key constraints: donation records linked with ondelete="RESTRICT"
        donation_stmt = select(Donation.donor_id).where(Donation.donor_id.in_(donor_ids)).distinct()
        donation_res = await db.execute(donation_stmt)
        donors_with_donations = set(donation_res.scalars().all())

        if donors_with_donations:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Cannot delete donors with active donation history. "
                    f"Conflicting donor IDs: {sorted(list(donors_with_donations))}"
                ),
            )

        # Proceed to delete donors
        for d_id in donor_ids:
            donor, _ = found_map[d_id]
            await db.delete(donor)
            successful_count += 1

        await create_audit_log(
            db=db,
            action="bulk_donor_delete",
            entity_type="donor",
            user_id=current_user.id,
            description=f"Bulk deletion executed on {successful_count} donor profile(s) by admin {current_user.email}: {donor_ids}",
            ip_address=ip_addr,
        )
        await db.commit()

        return BulkDonorActionResponse(
            requested_count=len(donor_ids),
            successful_count=successful_count,
            failed_count=0,
            action=action,
            message=f"Successfully deleted {successful_count} donor profile(s).",
            failed_ids=[],
        )




