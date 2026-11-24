from datetime import datetime, timezone
from typing import Optional, Tuple, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc

from app.models.email_notification import UserEmailPreference, EmailDeliveryLog


async def get_user_preference(
    db: AsyncSession,
    user_id: int,
) -> UserEmailPreference:
    """Retrieve email preferences for a user, creating default preferences if none exist."""
    res = await db.execute(
        select(UserEmailPreference).where(UserEmailPreference.user_id == user_id)
    )
    pref = res.scalar_one_or_none()
    if not pref:
        pref = UserEmailPreference(
            user_id=user_id,
            email_notifications_enabled=True,
            notify_donor_events=True,
            notify_donation_events=True,
            notify_stock_events=True,
            notify_request_events=True,
        )
        db.add(pref)
        await db.commit()
        await db.refresh(pref)
    return pref


async def update_user_preference(
    db: AsyncSession,
    user_id: int,
    **kwargs,
) -> UserEmailPreference:
    """Update preference fields for a specific user."""
    pref = await get_user_preference(db, user_id)
    for field, val in kwargs.items():
        if val is not None and hasattr(pref, field):
            setattr(pref, field, val)
    await db.commit()
    await db.refresh(pref)
    return pref


async def check_user_email_allowed(
    db: AsyncSession,
    user_id: int,
    category: str,
) -> bool:
    """Check if the user has opted in to receive email for this category."""
    pref = await get_user_preference(db, user_id)
    if not pref.email_notifications_enabled:
        return False
    if category == "donor" and not pref.notify_donor_events:
        return False
    if category == "donation" and not pref.notify_donation_events:
        return False
    if category == "stock" and not pref.notify_stock_events:
        return False
    if category == "request" and not pref.notify_request_events:
        return False
    return True


async def log_email_delivery(
    db: AsyncSession,
    recipient_email: str,
    subject: str,
    category: str,
    status: str,
    recipient_user_id: Optional[int] = None,
    error_message: Optional[str] = None,
    sent_at: Optional[Any] = None,
) -> EmailDeliveryLog:
    """Log an email delivery attempt safely without credentials or PII."""
    log_entry = EmailDeliveryLog(
        recipient_user_id=recipient_user_id,
        recipient_email=recipient_email,
        subject=subject[:255],
        category=category[:50],
        status=status[:30],
        error_message=error_message[:500] if error_message else None,
        sent_at=sent_at,
    )
    db.add(log_entry)
    await db.commit()
    await db.refresh(log_entry)
    return log_entry


async def list_email_logs(
    db: AsyncSession,
    skip: int = 0,
    limit: int = 50,
    recipient_user_id: Optional[int] = None,
) -> Tuple[list[EmailDeliveryLog], int]:
    """List email delivery logs with pagination."""
    query = select(EmailDeliveryLog)
    if recipient_user_id is not None:
        query = query.where(EmailDeliveryLog.recipient_user_id == recipient_user_id)
    
    # Total count
    count_query = select(func.count(EmailDeliveryLog.id))
    if recipient_user_id is not None:
        count_query = count_query.where(EmailDeliveryLog.recipient_user_id == recipient_user_id)
    total_res = await db.execute(count_query)
    total = total_res.scalar() or 0

    items_res = await db.execute(
        query.order_by(desc(EmailDeliveryLog.created_at)).offset(skip).limit(limit)
    )
    items = list(items_res.scalars().all())
    return items, total
