from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.dependencies import get_db
from app.models.user import User
from app.core.permissions import require_admin
from app.schemas.audit_log import AuditLogListResponse, AuditLogResponse
from app.crud.audit_log import get_audit_logs, get_audit_log_by_id

router = APIRouter(prefix="/audit-logs", tags=["Audit Logs"])


@router.get(
    "/",
    response_model=AuditLogListResponse,
    summary="List audit logs",
    description="Retrieve paginated audit logs with optional filters. Restricted to administrators.",
)
async def list_audit_logs(
    action: Optional[str] = Query(None, description="Filter by action name"),
    entity_type: Optional[str] = Query(None, description="Filter by entity type (e.g. user, donor, donation, stock, request)"),
    user_id: Optional[int] = Query(None, description="Filter by actor user ID"),
    start_date: Optional[date] = Query(None, description="Filter logs starting from this date (YYYY-MM-DD)"),
    end_date: Optional[date] = Query(None, description="Filter logs up to this date (YYYY-MM-DD)"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    return await get_audit_logs(
        db=db,
        action=action,
        entity_type=entity_type,
        user_id=user_id,
        start_date=start_date,
        end_date=end_date,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/{log_id}",
    response_model=AuditLogResponse,
    summary="Get audit log details",
    description="Retrieve a single audit log entry by ID. Restricted to administrators.",
)
async def get_audit_log_details(
    log_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    log_entry = await get_audit_log_by_id(db=db, log_id=log_id)
    if not log_entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audit log not found",
        )
    return AuditLogResponse.model_validate(log_entry)
