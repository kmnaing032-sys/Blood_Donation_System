from datetime import datetime, date
from typing import Optional
from math import ceil
from sqlalchemy import select, func, desc
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.schemas.audit_log import AuditLogListResponse, AuditLogResponse


async def get_audit_logs(
    db: AsyncSession,
    action: Optional[str] = None,
    entity_type: Optional[str] = None,
    user_id: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    page: int = 1,
    page_size: int = 20,
) -> AuditLogListResponse:
    """Retrieve paginated audit logs with filtering."""
    query = select(AuditLog).options(selectinload(AuditLog.user))
    count_query = select(func.count(AuditLog.id))

    filters = []
    if action:
        filters.append(AuditLog.action == action)
    if entity_type:
        filters.append(AuditLog.entity_type == entity_type)
    if user_id:
        filters.append(AuditLog.user_id == user_id)
    if start_date:
        start_dt = datetime.combine(start_date, datetime.min.time())
        filters.append(AuditLog.created_at >= start_dt)
    if end_date:
        end_dt = datetime.combine(end_date, datetime.max.time())
        filters.append(AuditLog.created_at <= end_dt)

    if filters:
        for f in filters:
            query = query.where(f)
            count_query = count_query.where(f)

    # Total count
    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    # Pagination and sorting
    total_pages = ceil(total / page_size) if total > 0 else 1
    offset = (page - 1) * page_size
    query = query.order_by(desc(AuditLog.created_at)).offset(offset).limit(page_size)

    result = await db.execute(query)
    items = result.scalars().all()

    return AuditLogListResponse(
        items=[AuditLogResponse.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


async def get_audit_log_by_id(
    db: AsyncSession,
    log_id: int,
) -> AuditLog | None:
    """Retrieve a single audit log entry by ID."""
    query = select(AuditLog).options(selectinload(AuditLog.user)).where(AuditLog.id == log_id)
    result = await db.execute(query)
    return result.scalar_one_or_none()
