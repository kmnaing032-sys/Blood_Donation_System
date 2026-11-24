from datetime import datetime, date
from typing import Tuple, List, Optional
from sqlalchemy import select, func, and_, or_, cast, Date
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.blood_request import BloodRequest
from app.models.blood_stock import BloodStock
from app.crud.blood_stock import get_blood_stock_by_group
from app.schemas.blood_request import BloodRequestCreate, BloodRequestUpdate


VALID_TRANSITIONS = {
    "pending": {"approved", "rejected", "cancelled"},
    "approved": {"fulfilled", "cancelled"},
    "rejected": set(),    # Terminal state
    "fulfilled": set(),   # Terminal state
    "cancelled": set(),   # Terminal state
}


def _append_audit_note(existing_notes: Optional[str], action: str, note: Optional[str]) -> str:
    """Helper to maintain chronological audit notes."""
    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
    entry = f"[{timestamp}] Status changed to '{action}'"
    if note:
        entry += f": {note.strip()}"
    return f"{existing_notes}\n{entry}" if existing_notes else entry


async def get_blood_request_by_id(
    db: AsyncSession,
    request_id: int,
) -> Optional[BloodRequest]:
    """Retrieve blood request by ID."""
    result = await db.execute(
        select(BloodRequest).where(BloodRequest.id == request_id)
    )
    return result.scalar_one_or_none()


async def get_all_blood_requests(
    db: AsyncSession,
    skip: int = 0,
    limit: int = 10,
    user_id: Optional[int] = None,
    blood_group: Optional[str] = None,
    status: Optional[str] = None,
    hospital_name: Optional[str] = None,
    patient_name: Optional[str] = None,
    search: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    request_date: Optional[date] = None,
    sort_by: str = "created_at",
    sort_order: str = "desc",
) -> Tuple[List[BloodRequest], int]:
    """Retrieve paginated blood requests with filtering, search, date range, and sorting."""
    query = select(BloodRequest)
    count_query = select(func.count(BloodRequest.id))

    filters = []
    if user_id is not None:
        filters.append(BloodRequest.user_id == user_id)
    if blood_group is not None:
        filters.append(BloodRequest.blood_group == blood_group)
    if status is not None:
        filters.append(BloodRequest.status == status)
    if hospital_name is not None:
        filters.append(BloodRequest.hospital_name.ilike(f"%{hospital_name}%"))
    if patient_name is not None:
        filters.append(BloodRequest.patient_name.ilike(f"%{patient_name}%"))
    if search is not None:
        search_term = f"%{search}%"
        filters.append(
            or_(
                BloodRequest.patient_name.ilike(search_term),
                BloodRequest.hospital_name.ilike(search_term),
                BloodRequest.contact_phone.ilike(search_term),
            )
        )
    if request_date is not None:
        filters.append(cast(BloodRequest.created_at, Date) == request_date)
    if start_date is not None:
        filters.append(cast(BloodRequest.created_at, Date) >= start_date)
    if end_date is not None:
        filters.append(cast(BloodRequest.created_at, Date) <= end_date)

    if filters:
        query = query.where(*filters)
        count_query = count_query.where(*filters)

    total_res = await db.execute(count_query)
    total = total_res.scalar_one() or 0

    sort_field_map = {
        "created_at": BloodRequest.created_at,
        "updated_at": BloodRequest.updated_at,
        "patient_name": BloodRequest.patient_name,
        "quantity_ml": BloodRequest.quantity_ml,
        "urgency": BloodRequest.urgency,
        "status": BloodRequest.status,
    }
    col = sort_field_map.get(sort_by, BloodRequest.created_at)
    order_clause = col.desc() if sort_order.lower() == "desc" else col.asc()

    query = query.order_by(order_clause, BloodRequest.id.desc()).offset(skip).limit(limit)
    res = await db.execute(query)
    return list(res.scalars().all()), total


async def create_blood_request(
    db: AsyncSession,
    request_data: BloodRequestCreate,
    user_id: Optional[int] = None,
) -> BloodRequest:
    """
    Creates a new blood request in 'pending' status.
    Rule: Never deducts blood stock upon creation.
    """
    blood_req = BloodRequest(
        user_id=user_id,
        patient_name=request_data.patient_name,
        hospital_name=request_data.hospital_name,
        hospital_address=request_data.hospital_address,
        blood_group=request_data.blood_group,
        quantity_ml=request_data.quantity_ml,
        urgency=request_data.urgency,
        contact_phone=request_data.contact_phone,
        required_by=request_data.required_by,
        notes=request_data.notes,
        status="pending",
    )
    db.add(blood_req)
    await db.commit()
    await db.refresh(blood_req)
    return blood_req


async def update_blood_request(
    db: AsyncSession,
    blood_req: BloodRequest,
    update_data: BloodRequestUpdate,
) -> BloodRequest:
    """Update fields on a pending blood request."""
    if blood_req.status != "pending":
        raise ValueError(f"Cannot update blood request in '{blood_req.status}' status. Only 'pending' requests can be edited.")

    update_dict = update_data.model_dump(exclude_unset=True)
    for field, value in update_dict.items():
        setattr(blood_req, field, value)

    await db.commit()
    await db.refresh(blood_req)
    return blood_req


async def approve_blood_request(
    db: AsyncSession,
    blood_req: BloodRequest,
    note: Optional[str] = None,
) -> BloodRequest:
    """
    Approve a pending blood request.
    Rule: Never deducts blood stock upon approval.
    """
    if blood_req.status != "pending":
        raise ValueError(
            f"Cannot approve request with status '{blood_req.status}'. Only 'pending' requests can be approved."
        )

    blood_req.status = "approved"
    blood_req.notes = _append_audit_note(blood_req.notes, "approved", note)

    await db.commit()
    await db.refresh(blood_req)
    return blood_req


async def reject_blood_request(
    db: AsyncSession,
    blood_req: BloodRequest,
    note: Optional[str] = None,
) -> BloodRequest:
    """
    Reject a pending blood request.
    """
    if blood_req.status != "pending":
        raise ValueError(
            f"Cannot reject request with status '{blood_req.status}'. Only 'pending' requests can be rejected."
        )

    blood_req.status = "rejected"
    blood_req.notes = _append_audit_note(blood_req.notes, "rejected", note)

    await db.commit()
    await db.refresh(blood_req)
    return blood_req


async def cancel_blood_request(
    db: AsyncSession,
    blood_req: BloodRequest,
    note: Optional[str] = None,
) -> BloodRequest:
    """
    Cancel a blood request (allowed only from pending or approved status).
    """
    if blood_req.status not in ["pending", "approved"]:
        raise ValueError(
            f"Cannot cancel request with status '{blood_req.status}'. Only 'pending' or 'approved' requests can be cancelled."
        )

    blood_req.status = "cancelled"
    blood_req.notes = _append_audit_note(blood_req.notes, "cancelled", note)

    await db.commit()
    await db.refresh(blood_req)
    return blood_req


async def fulfill_blood_request(
    db: AsyncSession,
    blood_req: BloodRequest,
    note: Optional[str] = None,
) -> BloodRequest:
    """
    Fulfill an approved blood request:
    1. Validates that status is 'approved'.
    2. Atomically locks BloodStock row (with_for_update).
    3. Checks sufficient available stock in ml.
    4. Deducts quantity_ml from available stock exactly once.
    5. Updates status to 'fulfilled'.
    6. Commits both atomically in a single PostgreSQL transaction.
    """
    if blood_req.status != "approved":
        raise ValueError(
            f"Cannot fulfill request in '{blood_req.status}' status. "
            f"A blood request must be 'approved' before fulfillment."
        )

    # 1. Lock and fetch blood stock
    stock = await get_blood_stock_by_group(db, blood_req.blood_group, for_update=True)
    if not stock:
        raise ValueError(f"No blood stock inventory found for blood group '{blood_req.blood_group}'.")

    # 2. Check sufficient available stock
    if stock.available_quantity_ml < blood_req.quantity_ml:
        raise ValueError(
            f"Insufficient available stock for blood group '{blood_req.blood_group}'. "
            f"Required: {blood_req.quantity_ml} ml, Available: {stock.available_quantity_ml} ml."
        )

    # 3. Deduct stock exactly once
    stock.available_quantity_ml -= blood_req.quantity_ml

    # 4. Update status & audit trail
    blood_req.status = "fulfilled"
    blood_req.notes = _append_audit_note(blood_req.notes, "fulfilled", note)

    await db.commit()
    await db.refresh(blood_req)
    return blood_req

