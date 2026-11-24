
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.schemas.auth import UserUpdate


async def count_active_admins(
    db: AsyncSession
) -> int:
    result = await db.execute(
        select(func.count(User.id)).where(
            User.role == "admin",
            User.is_active == True,
        )
    )
    return result.scalar_one() or 0


async def get_user_by_id(
    db: AsyncSession,
    user_id: int
):
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    return result.scalar_one_or_none()


async def get_all_users(
    db: AsyncSession
):
    result = await db.execute(
        select(User).order_by(User.id)
    )
    return result.scalars().all()


async def update_user(
    db: AsyncSession,
    user: User,
    user_data: UserUpdate
):
    update_data = user_data.model_dump(
        exclude_unset=True
    )

    for key, value in update_data.items():
        setattr(user, key, value)

    await db.commit()
    await db.refresh(user)

    return user


async def delete_user(
    db: AsyncSession,
    user: User
):
    await db.delete(user)
    await db.commit()

    return True
