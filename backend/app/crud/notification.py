from typing import Sequence
from sqlalchemy import select, func, update, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification
from app.schemas.notification import NotificationCreate


async def create_notification(
    db: AsyncSession,
    user_id: int,
    notification_data: NotificationCreate,
) -> Notification:
    notification = Notification(
        user_id=user_id,
        title=notification_data.title,
        message=notification_data.message,
        category=notification_data.category,
    )
    db.add(notification)
    await db.commit()
    await db.refresh(notification)
    return notification


async def get_user_notifications(
    db: AsyncSession,
    user_id: int,
    skip: int = 0,
    limit: int = 50,
) -> tuple[Sequence[Notification], int]:
    # Total count for this user
    count_query = select(func.count(Notification.id)).where(Notification.user_id == user_id)
    total_res = await db.execute(count_query)
    total = total_res.scalar_one() or 0

    # Notification items ordered by newest first
    query = (
        select(Notification)
        .where(Notification.user_id == user_id)
        .order_by(Notification.created_at.desc(), Notification.id.desc())
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(query)
    items = result.scalars().all()
    return items, total


async def get_unread_count(
    db: AsyncSession,
    user_id: int,
) -> int:
    query = select(func.count(Notification.id)).where(
        Notification.user_id == user_id,
        Notification.is_read == False,  # noqa: E712
    )
    result = await db.execute(query)
    return result.scalar_one() or 0


async def get_notification_by_id(
    db: AsyncSession,
    notification_id: int,
    user_id: int,
) -> Notification | None:
    query = select(Notification).where(
        Notification.id == notification_id,
        Notification.user_id == user_id,
    )
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def mark_as_read(
    db: AsyncSession,
    notification_id: int,
    user_id: int,
) -> Notification | None:
    notification = await get_notification_by_id(db, notification_id, user_id)
    if not notification:
        return None

    if not notification.is_read:
        notification.is_read = True
        await db.commit()
        await db.refresh(notification)

    return notification


async def mark_all_as_read(
    db: AsyncSession,
    user_id: int,
) -> int:
    query = (
        update(Notification)
        .where(
            Notification.user_id == user_id,
            Notification.is_read == False,  # noqa: E712
        )
        .values(is_read=True)
    )
    result = await db.execute(query)
    await db.commit()
    return result.rowcount


async def delete_notification(
    db: AsyncSession,
    notification_id: int,
    user_id: int,
) -> bool:
    notification = await get_notification_by_id(db, notification_id, user_id)
    if not notification:
        return False

    await db.delete(notification)
    await db.commit()
    return True
