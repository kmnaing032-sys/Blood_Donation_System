import math
from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.dependencies import get_db
from app.models.user import User
from app.models.blood_request import BloodRequest
from app.core.auth_dependencies import get_current_user
from app.core.permissions import require_roles
from app.services.audit_service import create_audit_log
from app.crud.blood_request import (
    create_blood_request,
    get_blood_request_by_id,
    get_all_blood_requests,
    update_blood_request,
    approve_blood_request,
    reject_blood_request,
    cancel_blood_request,
    fulfill_blood_request,
)
from app.schemas.blood_request import (
    BloodRequestCreate,
    BloodRequestUpdate,
    BloodRequestStatusAction,
    BloodRequestResponse,
    PaginatedBloodRequestsResponse,
)

router = APIRouter(
    prefix="/blood-requests",
    tags=["Blood Requests"],
)


# 1. CREATE BLOOD REQUEST: POST /api/v1/blood-requests/
@router.post(
    "/",
    response_model=BloodRequestResponse,
    status_code=status.HTTP_201_CREATED,
)
async def submit_blood_request(
    request_in: BloodRequestCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Submit a new blood request.
    - Accessible to all authenticated users (User, Staff, Admin).
    - Status defaults to 'pending'.
    - Rule: NEVER deducts blood stock upon creation.
    """
    new_request = await create_blood_request(
        db=db,
        request_data=request_in,
        user_id=current_user.id,
    )

    # Audit log
    ip_addr = request.client.host if request.client else None
    await create_audit_log(
        db=db,
        action="blood_request_created",
        entity_type="blood_request",
        entity_id=new_request.id,
        user_id=current_user.id,
        description=f"Blood request submitted for {new_request.quantity_ml}ml ({new_request.blood_group}) - Urgency: {new_request.urgency}",
        ip_address=ip_addr,
    )
    try:
        await db.commit()
    except Exception:
        await db.rollback()

    # Event hook: Generate notification for new blood request
    try:
        from app.services.notification_service import notify_blood_request_created
        await notify_blood_request_created(db, new_request, acting_user=current_user)
    except Exception:
        pass

    return new_request


# 2. LIST BLOOD REQUESTS: GET /api/v1/blood-requests/
@router.get(
    "/",
    response_model=PaginatedBloodRequestsResponse,
)
async def list_blood_requests(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(10, ge=1, le=100, description="Items per page"),
    blood_group: Optional[str] = Query(None, description="Filter by blood group"),
    status: Optional[str] = Query(None, description="Filter by status (pending, approved, rejected, fulfilled, cancelled)"),
    hospital_name: Optional[str] = Query(None, description="Search/Filter by hospital name"),
    patient_name: Optional[str] = Query(None, description="Search/Filter by patient name"),
    search: Optional[str] = Query(None, description="Search across patient name, hospital name, and contact phone"),
    request_date: Optional[date] = Query(None, description="Filter by submission date (YYYY-MM-DD)"),
    start_date: Optional[date] = Query(None, description="Filter from start date (YYYY-MM-DD)"),
    end_date: Optional[date] = Query(None, description="Filter up to end date (YYYY-MM-DD)"),
    sort_by: str = Query("created_at", description="Sort by field: created_at, updated_at, patient_name, quantity_ml, urgency, status"),
    sort_order: str = Query("desc", description="Sort order: asc or desc"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List blood requests with pagination, filtering, search, date ranges, and sorting.
    - Admin & Staff: Full access to all blood requests.
    - Regular Users: Restricted to viewing their own submitted requests only.
    """
    # Restrict ordinary users to their own requests
    filter_user_id = None
    if current_user.role not in ["admin", "staff"]:
        filter_user_id = current_user.id

    skip = (page - 1) * page_size
    requests, total = await get_all_blood_requests(
        db=db,
        skip=skip,
        limit=page_size,
        user_id=filter_user_id,
        blood_group=blood_group,
        status=status,
        hospital_name=hospital_name,
        patient_name=patient_name,
        search=search,
        start_date=start_date,
        end_date=end_date,
        request_date=request_date,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    total_pages = math.ceil(total / page_size) if total > 0 else 0

    return PaginatedBloodRequestsResponse(
        items=requests,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


# 3. GET SINGLE BLOOD REQUEST: GET /api/v1/blood-requests/{request_id}
@router.get(
    "/{request_id}",
    response_model=BloodRequestResponse,
)
async def get_blood_request(
    request_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retrieve single blood request by ID.
    - Admin & Staff can view any request.
    - Regular users can only view their own request.
    """
    blood_req = await get_blood_request_by_id(db, request_id)
    if not blood_req:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Blood request not found",
        )

    if current_user.role not in ["admin", "staff"] and blood_req.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view this blood request",
        )

    return blood_req


# 4. UPDATE BLOOD REQUEST: PATCH /api/v1/blood-requests/{request_id}
@router.patch(
    "/{request_id}",
    response_model=BloodRequestResponse,
)
async def modify_blood_request(
    request_id: int,
    update_in: BloodRequestUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Edit a blood request.
    - Only allowed if request is in 'pending' status.
    - User can update their own pending request; Staff and Admin can update any pending request.
    """
    blood_req = await get_blood_request_by_id(db, request_id)
    if not blood_req:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Blood request not found",
        )

    if current_user.role not in ["admin", "staff"] and blood_req.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to update this blood request",
        )

    try:
        updated = await update_blood_request(db, blood_req, update_in)
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve),
        )

    return updated


# 5. APPROVE BLOOD REQUEST: POST /api/v1/blood-requests/{request_id}/approve
@router.post(
    "/{request_id}/approve",
    response_model=BloodRequestResponse,
)
async def approve_request_endpoint(
    request_id: int,
    action_in: Optional[BloodRequestStatusAction] = None,
    request: Request = None,
    db: AsyncSession = Depends(get_db),
    authorized_staff: User = Depends(require_roles("admin", "staff")),
):
    """
    Approve a pending blood request.
    - RBAC: Restricted to Admin and Staff only.
    - Rule: NEVER deducts stock upon approval.
    """
    blood_req = await get_blood_request_by_id(db, request_id)
    if not blood_req:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Blood request not found",
        )

    note = action_in.notes if action_in else None
    try:
        approved = await approve_blood_request(db, blood_req, note=note)
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve),
        )

    ip_addr = request.client.host if (request and request.client) else None
    await create_audit_log(
        db=db,
        action="blood_request_approved",
        entity_type="blood_request",
        entity_id=approved.id,
        user_id=authorized_staff.id,
        description=f"Blood request ID {approved.id} approved by {authorized_staff.email}",
        ip_address=ip_addr,
    )
    try:
        await db.commit()
    except Exception:
        await db.rollback()

    # Event hook: Generate notification for request approval
    try:
        from app.services.notification_service import notify_blood_request_status_changed
        await notify_blood_request_status_changed(
            db, approved, previous_status="pending", acting_user=authorized_staff
        )
    except Exception:
        pass

    return approved


# 6. REJECT BLOOD REQUEST: POST /api/v1/blood-requests/{request_id}/reject
@router.post(
    "/{request_id}/reject",
    response_model=BloodRequestResponse,
)
async def reject_request_endpoint(
    request_id: int,
    action_in: Optional[BloodRequestStatusAction] = None,
    request: Request = None,
    db: AsyncSession = Depends(get_db),
    authorized_staff: User = Depends(require_roles("admin", "staff")),
):
    """
    Reject a pending blood request.
    - RBAC: Restricted to Admin and Staff only.
    """
    blood_req = await get_blood_request_by_id(db, request_id)
    if not blood_req:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Blood request not found",
        )

    note = action_in.notes if action_in else None
    try:
        rejected = await reject_blood_request(db, blood_req, note=note)
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve),
        )

    ip_addr = request.client.host if (request and request.client) else None
    await create_audit_log(
        db=db,
        action="blood_request_rejected",
        entity_type="blood_request",
        entity_id=rejected.id,
        user_id=authorized_staff.id,
        description=f"Blood request ID {rejected.id} rejected by {authorized_staff.email}",
        ip_address=ip_addr,
    )
    try:
        await db.commit()
    except Exception:
        await db.rollback()

    # Event hook: Generate notification for request rejection
    try:
        from app.services.notification_service import notify_blood_request_status_changed
        await notify_blood_request_status_changed(
            db, rejected, previous_status="pending", acting_user=authorized_staff
        )
    except Exception:
        pass

    return rejected


# 7. FULFILL BLOOD REQUEST: POST /api/v1/blood-requests/{request_id}/fulfill
@router.post(
    "/{request_id}/fulfill",
    response_model=BloodRequestResponse,
)
async def fulfill_request_endpoint(
    request_id: int,
    action_in: Optional[BloodRequestStatusAction] = None,
    request: Request = None,
    db: AsyncSession = Depends(get_db),
    authorized_staff: User = Depends(require_roles("admin", "staff")),
):
    """
    Fulfill an approved blood request:
    - RBAC: Restricted to Admin and Staff only.
    - Validates that request is in 'approved' status.
    - Locks BloodStock row and verifies sufficient available volume in ml.
    - Deducts quantity exactly once from BloodStock.
    - Transactionally transitions status to 'fulfilled'.
    """
    blood_req = await get_blood_request_by_id(db, request_id)
    if not blood_req:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Blood request not found",
        )

    note = action_in.notes if action_in else None
    try:
        fulfilled = await fulfill_blood_request(db, blood_req, note=note)
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve),
        )
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fulfill request: {str(e)}",
        )

    ip_addr = request.client.host if (request and request.client) else None
    await create_audit_log(
        db=db,
        action="blood_request_fulfilled",
        entity_type="blood_request",
        entity_id=fulfilled.id,
        user_id=authorized_staff.id,
        description=f"Blood request ID {fulfilled.id} fulfilled ({fulfilled.quantity_ml}ml {fulfilled.blood_group} deducted)",
        ip_address=ip_addr,
    )
    try:
        await db.commit()
    except Exception:
        await db.rollback()

    # Event hook: Generate notification for request fulfillment
    try:
        from app.services.notification_service import notify_blood_request_status_changed
        await notify_blood_request_status_changed(
            db, fulfilled, previous_status="approved", acting_user=authorized_staff
        )
    except Exception:
        pass

    return fulfilled


# 8. CANCEL BLOOD REQUEST: POST /api/v1/blood-requests/{request_id}/cancel
@router.post(
    "/{request_id}/cancel",
    response_model=BloodRequestResponse,
)
async def cancel_request_endpoint(
    request_id: int,
    action_in: Optional[BloodRequestStatusAction] = None,
    request: Request = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Cancel a blood request (from pending or approved).
    - User can cancel their own request; Staff and Admin can cancel any request.
    """
    blood_req = await get_blood_request_by_id(db, request_id)
    if not blood_req:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Blood request not found",
        )

    if current_user.role not in ["admin", "staff"] and blood_req.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to cancel this blood request",
        )

    note = action_in.notes if action_in else None
    try:
        cancelled = await cancel_blood_request(db, blood_req, note=note)
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve),
        )

    ip_addr = request.client.host if (request and request.client) else None
    await create_audit_log(
        db=db,
        action="blood_request_cancelled",
        entity_type="blood_request",
        entity_id=cancelled.id,
        user_id=current_user.id,
        description=f"Blood request ID {cancelled.id} cancelled by {current_user.email}",
        ip_address=ip_addr,
    )
    try:
        await db.commit()
    except Exception:
        await db.rollback()

    # Event hook: Generate notification for request cancellation
    try:
        from app.services.notification_service import notify_blood_request_status_changed
        await notify_blood_request_status_changed(
            db, cancelled, previous_status="active", acting_user=current_user
        )
    except Exception:
        pass

    return cancelled

