
import asyncio

from sqlalchemy import text
from app.database.database import engine


async def test_connection():
    try:
        async with engine.connect() as connection:
            result = await connection.execute(
                text("SELECT 1")
            )

            print("Database Connection: SUCCESS")
            print("Test Result:", result.scalar())

    except Exception as error:
        print("Database Connection: FAILED")
        print("Error:", error)

    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(test_connection())
