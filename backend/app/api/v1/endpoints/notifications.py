from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.dependencies import get_db
from app.core.auth_dependencies import get_current_user
from app.models.user import User
from app.schemas.notification import (
    NotificationResponse,
    NotificationListResponse,
)
from app.crud.notification import (
    get_user_notifications,
    get_unread_count as crud_get_unread_count,
    mark_as_read as crud_mark_as_read,
    mark_all_as_read as crud_mark_all_as_read,
    delete_notification as crud_delete_notification,
)

router = APIRouter(
    prefix="/notifications",
    tags=["Notifications"],
)


@router.get("/", response_model=NotificationListResponse)
async def list_notifications(
    skip: int = Query(0, ge=0, description="Items to skip"),
    limit: int = Query(50, ge=1, le=100, description="Items to return"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve notifications belonging strictly to the authenticated user."""
    items, total = await get_user_notifications(
        db=db,
        user_id=current_user.id,
        skip=skip,
        limit=limit,
    )
    unread = await crud_get_unread_count(db=db, user_id=current_user.id)
    return NotificationListResponse(
        items=items,
        total=total,
        unread_count=unread,
    )


@router.get("/unread-count")
async def get_unread_count(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve unread notification count for the authenticated user."""
    unread = await crud_get_unread_count(db=db, user_id=current_user.id)
    return {"unread_count": unread}


@router.patch("/{notification_id}/read", response_model=NotificationResponse)
async def mark_notification_read(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark a specific notification as read. Ownership is strictly enforced (returns 404 if not found or unauthorized)."""
    notification = await crud_mark_as_read(
        db=db,
        notification_id=notification_id,
        user_id=current_user.id,
    )
    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found",
        )
    return notification


@router.post("/read-all")
async def mark_all_notifications_read(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark all unread notifications belonging to the authenticated user as read."""
    updated_count = await crud_mark_all_as_read(
        db=db,
        user_id=current_user.id,
    )
    return {
        "message": "All notifications marked as read",
        "updated_count": updated_count,
    }


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a specific notification. Ownership is strictly enforced (returns 404 if not found or unauthorized)."""
    deleted = await crud_delete_notification(
        db=db,
        notification_id=notification_id,
        user_id=current_user.id,
    )
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found",
        )
    return {"message": "Notification deleted successfully"}
