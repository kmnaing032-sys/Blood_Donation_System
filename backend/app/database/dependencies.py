
import logging
from collections.abc import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import SQLAlchemyError

from app.database.database import AsyncSessionLocal

logger = logging.getLogger("blood_donation_api")


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Yields an asynchronous database session.
    Ensures automatic rollback upon unhandled exception and session closure.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except SQLAlchemyError as sqle:
            await session.rollback()
            logger.error(f"SQLAlchemyError in session scope, rolled back: {sqle}")
            raise
        except Exception as e:
            await session.rollback()
            logger.error(f"Unhandled exception in session scope, rolled back: {e}")
            raise
        finally:
            await session.close()

