
import asyncio
import re
from getpass import getpass

from sqlalchemy import select
from sqlalchemy.engine import make_url

from app.core.config import settings
from app.core.security import hash_password
from app.database.database import AsyncSessionLocal, engine
from app.models.user import User


async def create_admin():
    # Check that the database is a Railway PostgreSQL database.
    database_url = make_url(settings.DATABASE_URL)
    hostname = database_url.host or ""

    allowed_hosts = (
        hostname.endswith(".railway.internal")
        or hostname.endswith(".proxy.rlwy.net")
    )

    if not allowed_hosts:
        print("\nERROR: This does not appear to be a Railway database.")
        print("Database host:", hostname)
        print("No account was created.")
        return

    print("\nRailway database host:", hostname)
    confirmation = input(
        'Type RAILWAY to confirm the production database: '
    ).strip()

    if confirmation != "RAILWAY":
        print("Cancelled. No account was created.")
        return

    full_name = input("\nAdmin full name: ").strip()
    email = input("Admin email: ").strip().lower()

    if not full_name or not email:
        print("ERROR: Name and email are required.")
        return

    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        print("ERROR: Invalid email address.")
        return

    password = getpass("Admin password: ")
    confirm_password = getpass("Confirm password: ")

    if password != confirm_password:
        print("ERROR: Passwords do not match.")
        return

    if (
        len(password) < 8
        or not re.search(r"[A-Za-z]", password)
        or not re.search(r"\d", password)
    ):
        print("ERROR: Password must contain at least 8 characters,")
        print("including at least one letter and one number.")
        return

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(User).where(User.email == email)
        )
        existing_user = result.scalar_one_or_none()

        if existing_user:
            print("\nThis email already exists.")
            print("No changes were made to the existing account.")
            return

        admin = User(
            full_name=full_name,
            email=email,
            hashed_password=hash_password(password),
            role="admin",
            is_active=True,
        )

        db.add(admin)
        await db.commit()
        await db.refresh(admin)

        print("\nAdmin account created successfully.")
        print("ID:", admin.id)
        print("Email:", admin.email)
        print("Role:", admin.role)
        print("Active:", admin.is_active)


if __name__ == "__main__":
    try:
        asyncio.run(create_admin())
    except Exception as error:
        print("\nAdmin creation failed.")
        print("Error type:", type(error).__name__)
    finally:
        asyncio.run(engine.dispose())
