from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.dependencies import get_db
from app.core.auth_dependencies import get_current_user
from app.core.permissions import require_admin
from app.models.user import User
from app.services.email_service import EmailService
from app.crud.email_notification import (
    get_user_preference,
    update_user_preference,
    list_email_logs,
)
from app.schemas.email_notification import (
    UserEmailPreferenceResponse,
    UserEmailPreferenceUpdate,
    SmtpStatusResponse,
    EmailDeliveryLogListResponse,
)
from app.core.rate_limiter import rate_limit

router = APIRouter(prefix="/email-preferences", tags=["Email Preferences & SMTP"])


@router.get("/me", response_model=UserEmailPreferenceResponse, summary="Get current user's email preferences")
async def get_my_email_preferences(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve email preferences belonging strictly to the authenticated user."""
    return await get_user_preference(db=db, user_id=current_user.id)


@router.patch(
    "/me",
    response_model=UserEmailPreferenceResponse,
    summary="Update current user's email preferences",
    dependencies=[Depends(rate_limit("email:prefs"))],
)
async def update_my_email_preferences(
    payload: UserEmailPreferenceUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update current authenticated user's email preferences.
    
    Users can only update their own preferences.
    """
    updated = await update_user_preference(
        db=db,
        user_id=current_user.id,
        **payload.model_dump(exclude_unset=True),
    )
    return updated


@router.get("/smtp-status", response_model=SmtpStatusResponse, summary="Get safe SMTP status (Admin only)")
async def get_smtp_status(
    current_admin: User = Depends(require_admin),
):
    """Retrieve safe SMTP status information for administrators.
    
    Passwords and sensitive connection strings are strictly omitted.
    """
    return EmailService.get_smtp_status()


@router.get("/logs", response_model=EmailDeliveryLogListResponse, summary="Get email delivery logs (Admin only)")
async def get_email_delivery_logs(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    recipient_user_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    """Retrieve outbound email delivery tracking logs.
    
    Restricted strictly to administrators for operational auditing.
    """
    items, total = await list_email_logs(
        db=db,
        skip=skip,
        limit=limit,
        recipient_user_id=recipient_user_id,
    )
    return {"items": items, "total": total}
