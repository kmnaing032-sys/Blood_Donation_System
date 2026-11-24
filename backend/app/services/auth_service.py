
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status

from app.models.user import User
from app.schemas.auth import UserRegister, UserLogin
from app.core.security import hash_password, verify_password


# USER REGISTRATION
async def register_user(
    db: AsyncSession,
    user_data: UserRegister,
) -> User:

    # Check existing email
    result = await db.execute(
        select(User).where(User.email == user_data.email)
    )

    existing_user = result.scalar_one_or_none()

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    # Hash password
    hashed_password = hash_password(user_data.password)

    # Create new user
    new_user = User(
        full_name=user_data.full_name,
        email=user_data.email,
        hashed_password=hashed_password,
        role="donor",
        is_active=True,
    )

    db.add(new_user)

    try:
        await db.commit()
        await db.refresh(new_user)

    except Exception:
        await db.rollback()
        raise

    return new_user


# USER LOGIN
async def authenticate_user(
    db: AsyncSession,
    user_data: UserLogin,
) -> User | None:

    # Find user by email
    result = await db.execute(
        select(User).where(User.email == user_data.email)
    )

    user = result.scalar_one_or_none()

    # Check user exists
    if not user:
        return None

    # Check password
    if not verify_password(
        user_data.password,
        user.hashed_password,
    ):
        return None

    # Check account status
    if not user.is_active:
        return None

    return user
