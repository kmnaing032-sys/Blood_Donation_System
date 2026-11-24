
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from jose import jwt, JWTError

from app.database.dependencies import get_db
from app.schemas.auth import (
    UserRegister,
    UserLogin,
    UserResponse,
    TokenResponse,
    RefreshTokenRequest,
    ChangePasswordRequest,
    MessageResponse,
)
from app.services.auth_service import (
    register_user,
    authenticate_user,
)
from app.core.security import hash_password, verify_password
from app.services.audit_service import create_audit_log
from app.core.token import (
    create_access_token,
    create_refresh_token,
    ALGORITHM,
)
from app.core.config import settings
from app.core.auth_dependencies import get_current_user
from app.core.permissions import require_roles
from app.models.user import User
from datetime import datetime, timezone

from app.models.refresh_token import RefreshToken
from app.core.rate_limiter import rate_limit, rate_limiter
from app.core.login_protection import login_protector


router = APIRouter(
    prefix="/auth",
    tags=["Authentication"],
)

async def save_refresh_token(
    db: AsyncSession,
    user_id: int,
    refresh_token: str,
):
    payload = jwt.decode(
        refresh_token,
        settings.SECRET_KEY,
        algorithms=[ALGORITHM],
    )

    token_record = RefreshToken(
        user_id=user_id,
        jti=payload["jti"],
        expires_at=datetime.fromtimestamp(
            payload["exp"],
            tz=timezone.utc,
        ),
    )

    db.add(token_record)



# USER REGISTER
@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit("auth:register"))],
)
async def register(
    user_data: UserRegister,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    user = await register_user(
        db=db,
        user_data=user_data,
    )
    ip_addr = request.client.host if request.client else None
    await create_audit_log(
        db=db,
        action="user_registered",
        entity_type="user",
        entity_id=user.id,
        user_id=user.id,
        description=f"User {user.email} registered an account",
        ip_address=ip_addr,
    )
    try:
        await db.commit()
    except Exception:
        await db.rollback()
    return user


# USER LOGIN
@router.post(
    "/login",
    response_model=TokenResponse,
    dependencies=[Depends(rate_limit("auth:login"))],
)
async def login(
    user_data: UserLogin,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    ip_addr = request.client.host if request.client else "127.0.0.1"

    # 1. Check brute force lockout
    is_locked, remaining_lockout = await login_protector.check_lockout(ip=ip_addr, email=user_data.email)
    if is_locked:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed login attempts. Please try again in {remaining_lockout} seconds.",
            headers={"Retry-After": str(remaining_lockout)},
        )

    # 2. Authenticate user
    user = await authenticate_user(
        db=db,
        user_data=user_data,
    )

    if not user:
        # Record failed attempt in brute-force protector
        became_locked, lockout_sec = await login_protector.record_failure(ip=ip_addr, email=user_data.email)
        
        # Audit failed login attempt (without storing sensitive passwords)
        desc = f"Failed login attempt for email {user_data.email}"
        if became_locked:
            desc += f" (triggered {lockout_sec}s lockout)"

        await create_audit_log(
            db=db,
            action="login_failed",
            entity_type="auth",
            description=desc,
            ip_address=ip_addr,
        )
        try:
            await db.commit()
        except Exception:
            await db.rollback()

        if became_locked:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Account access temporarily throttled due to multiple failed attempts. Please try again in {lockout_sec} seconds.",
                headers={"Retry-After": str(lockout_sec)},
            )

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Reset failure counters upon successful authentication
    await login_protector.record_success(ip=ip_addr, email=user_data.email)

    access_token = create_access_token(
        data={"sub": str(user.id)}
    )

    refresh_token = create_refresh_token(
        data={"sub": str(user.id)}
    )

    await save_refresh_token(
        db=db,
        user_id=user.id,
        refresh_token=refresh_token,
    )

    await create_audit_log(
        db=db,
        action="login_success",
        entity_type="auth",
        entity_id=user.id,
        user_id=user.id,
        description=f"User {user.email} logged in successfully",
        ip_address=ip_addr,
    )

    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


# GET CURRENT USER
@router.get(
    "/me",
    response_model=UserResponse,
)
async def get_me(
    current_user: User = Depends(get_current_user),
):
    return current_user


# REFRESH ACCESS TOKEN

@router.post(
    "/refresh",
    response_model=TokenResponse,
    dependencies=[Depends(rate_limit("auth:refresh"))],
)
async def refresh_access_token(
    token_data: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db),
):

    # Decode Refresh Token
    try:
        payload = jwt.decode(
            token_data.refresh_token,
            settings.SECRET_KEY,
            algorithms=[ALGORITHM],
        )

        if payload.get("token_type") != "refresh":
            raise HTTPException(
                status_code=401,
                detail="Invalid refresh token",
            )

        user_id = int(payload["sub"])
        jti = payload["jti"]

    except (JWTError, ValueError, TypeError, KeyError):
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired refresh token",
        )

    # Find and lock the token record
    result = await db.execute(
        select(RefreshToken)
        .where(
            RefreshToken.jti == jti,
            RefreshToken.user_id == user_id,
        )
        .with_for_update()
    )

    old_token = result.scalar_one_or_none()

    if old_token is None or old_token.revoked_at is not None:
        raise HTTPException(
            status_code=401,
            detail="Refresh token is invalid or revoked",
        )

    # Check database expiration
    now = datetime.now(timezone.utc)

    if old_token.expires_at <= now:
        raise HTTPException(
            status_code=401,
            detail="Refresh token expired",
        )

    # Find User
    result = await db.execute(
        select(User).where(User.id == user_id)
    )

    user = result.scalar_one_or_none()

    if user is None or not user.is_active:
        raise HTTPException(
            status_code=401,
            detail="User not found or inactive",
        )

    # Revoke old token
    old_token.revoked_at = now

    # Create new tokens
    new_access_token = create_access_token(
        data={"sub": str(user.id)}
    )

    new_refresh_token = create_refresh_token(
        data={"sub": str(user.id)}
    )

    # Save new refresh token
    await save_refresh_token(
        db=db,
        user_id=user.id,
        refresh_token=new_refresh_token,
    )

    # Commit both changes together
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    return TokenResponse(
        access_token=new_access_token,
        refresh_token=new_refresh_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )



# ADMIN ONLY
@router.get("/admin-check")
async def admin_check(
    current_user: User = Depends(
        require_roles("admin")
    ),
):
    return {
        "message": "Welcome Admin",
        "user_id": current_user.id,
        "role": current_user.role,
    }


# STAFF AND ADMIN
@router.get("/staff-check")
async def staff_check(
    current_user: User = Depends(
        require_roles("admin", "staff")
    ),
):
    return {
        "message": "Staff access granted",
        "user_id": current_user.id,
        "role": current_user.role,
    }


# SELF-SERVICE CHANGE PASSWORD
@router.post(
    "/change-password",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(rate_limit("auth:change-password"))],
)
async def change_password(
    password_data: ChangePasswordRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Self-service password change for all authenticated users (Admin, Staff, Donor, User).
    Requires verification of the current password, validation of the new password,
    Argon2 hashing, revocation of all active refresh tokens for the user, and audit logging.
    """
    # 1. Verify confirmation password matches
    if password_data.new_password != password_data.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password and confirmation password do not match",
        )

    # 2. Verify current password
    if not verify_password(password_data.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect current password",
        )

    # 3. Prevent setting the same password
    if verify_password(password_data.new_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password cannot be the same as the current password",
        )

    # 4. Hash new password with Argon2
    new_hashed_password = hash_password(password_data.new_password)
    current_user.hashed_password = new_hashed_password
    db.add(current_user)

    # 5. Revoke all active refresh tokens for this user
    now = datetime.now(timezone.utc)
    from sqlalchemy import update
    await db.execute(
        update(RefreshToken)
        .where(
            RefreshToken.user_id == current_user.id,
            RefreshToken.revoked_at.is_(None),
        )
        .values(revoked_at=now)
    )

    # 6. Audit log
    ip_addr = request.client.host if request.client else None
    await create_audit_log(
        db=db,
        action="password_changed",
        entity_type="user",
        entity_id=current_user.id,
        user_id=current_user.id,
        description=f"User {current_user.email} changed their password",
        ip_address=ip_addr,
    )

    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    return MessageResponse(
        message="Password changed successfully. Please log in with your new password on other devices."
    )

