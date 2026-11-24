
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.database.dependencies import get_db
from app.crud.user import (
    get_user_by_id,
    get_all_users,
    update_user,
    delete_user,
    count_active_admins,
)
from app.schemas.auth import UserUpdate, UserResponse, AdminResetPasswordRequest, MessageResponse
from app.core.security import hash_password
from app.models.refresh_token import RefreshToken
from app.core.rate_limiter import rate_limit
from datetime import datetime, timezone
from sqlalchemy import update
from app.core.auth_dependencies import get_current_user
from app.core.permissions import require_admin
from app.models.user import User
from app.services.audit_service import create_audit_log


router = APIRouter(
    prefix="/users",
    tags=["Users"]
)


@router.get("/", response_model=List[UserResponse])
async def read_users(
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    users = await get_all_users(db)
    return users


@router.get("/{user_id}", response_model=UserResponse)
async def read_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Admin can view any user; other users can only view their own profile
    if current_user.role != "admin" and current_user.id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this resource",
        )

    user = await get_user_by_id(db, user_id)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    return user


@router.patch("/{user_id}", response_model=UserResponse)
async def edit_user(
    user_id: int,
    user_data: UserUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Only Admin can update other users
    if current_user.role != "admin" and current_user.id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this resource",
        )

    user = await get_user_by_id(db, user_id)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # Prevent users from changing their own role
    if user_data.role is not None:
        if current_user.id == user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Users are not allowed to change their own role",
            )
        if current_user.role != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only administrators can assign user roles",
            )

    # If deactivating an admin or changing an admin's role, prevent removing the last active admin
    if user.role == "admin" and (
        (user_data.is_active is False and user.is_active is True)
        or (user_data.role is not None and user_data.role != "admin")
    ):
        active_admin_count = await count_active_admins(db)
        if active_admin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot demote or deactivate the last active administrator",
            )

    old_role = user.role
    old_active = user.is_active

    updated_user = await update_user(
        db,
        user,
        user_data
    )

    # Construct descriptive action string
    changes = []
    if user_data.role is not None and user_data.role != old_role:
        changes.append(f"role changed from {old_role} to {user_data.role}")
    if user_data.is_active is not None and user_data.is_active != old_active:
        status_str = "activated" if user_data.is_active else "deactivated"
        changes.append(f"status {status_str}")
    if user_data.full_name is not None and user_data.full_name != user.full_name:
        changes.append("profile details updated")

    desc = f"User {user.email} updated: " + ", ".join(changes) if changes else f"User {user.email} updated"
    ip_addr = request.client.host if request.client else None
    await create_audit_log(
        db=db,
        action="user_updated",
        entity_type="user",
        entity_id=user.id,
        user_id=current_user.id,
        description=desc,
        ip_address=ip_addr,
    )
    try:
        await db.commit()
    except Exception:
        await db.rollback()

    return updated_user


@router.delete("/{user_id}")
async def remove_user(
    user_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    user = await get_user_by_id(db, user_id)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # Prevent deletion of the last active Admin
    if user.role == "admin" and user.is_active:
        active_admin_count = await count_active_admins(db)
        if active_admin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete the last active administrator",
            )

    # Check if user has dependent donor records with donation history
    from app.models.donor import Donor
    from app.models.donation import Donation
    from sqlalchemy import select

    donor_res = await db.execute(select(Donor).where(Donor.user_id == user_id))
    donor = donor_res.scalar_one_or_none()
    if donor:
        donation_res = await db.execute(select(Donation).where(Donation.donor_id == donor.id))
        donations = donation_res.scalars().all()
        if donations:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot delete user account {user.email}: this user has {len(donations)} associated donation record(s) that must be preserved for medical audit trails.",
            )

    user_email = user.email
    deleted_id = user.id

    ip_addr = request.client.host if request.client else None
    await create_audit_log(
        db=db,
        action="user_deleted",
        entity_type="user",
        entity_id=deleted_id,
        user_id=admin_user.id,
        description=f"Administrator {admin_user.email} deleted user account {user_email} (ID: {deleted_id})",
        ip_address=ip_addr,
    )

    await delete_user(db, user)

    return {
        "message": "User deleted successfully"
    }


# ADMIN RESET PASSWORD: POST /api/v1/users/{user_id}/reset-password
@router.post(
    "/{user_id}/reset-password",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(rate_limit("users:reset-password"))],
)
async def reset_user_password(
    user_id: int,
    reset_data: AdminResetPasswordRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    """
    Administrative password reset.
    Restricted strictly to administrators.
    Allows setting a new password for Staff, Donor, User, or Admin accounts.
    Hashes with Argon2, invalidates all existing refresh tokens for the target user,
    and creates an audit log entry.
    """
    # 1. Verify password confirmation
    if reset_data.new_password != reset_data.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password and confirmation password do not match",
        )

    # 2. Find target user
    user = await get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # 3. Hash new password with Argon2
    new_hashed_password = hash_password(reset_data.new_password)
    user.hashed_password = new_hashed_password
    db.add(user)

    # 4. Invalidate all active refresh tokens for the target user
    now = datetime.now(timezone.utc)
    await db.execute(
        update(RefreshToken)
        .where(
            RefreshToken.user_id == user.id,
            RefreshToken.revoked_at.is_(None),
        )
        .values(revoked_at=now)
    )

    # 5. Create audit log
    ip_addr = request.client.host if request.client else None
    await create_audit_log(
        db=db,
        action="admin_password_reset",
        entity_type="user",
        entity_id=user.id,
        user_id=admin_user.id,
        description=f"Administrator {admin_user.email} reset password for user {user.email} (ID: {user.id})",
        ip_address=ip_addr,
    )

    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    return MessageResponse(
        message=f"Password for user {user.email} was reset successfully."
    )


