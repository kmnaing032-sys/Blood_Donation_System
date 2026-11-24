import asyncio
import asyncpg
from app.core.config import settings

async def setup():
    base_url = settings.DATABASE_URL.rsplit('/', 1)[0]
    clean_url = base_url.replace('postgresql+asyncpg://', 'postgresql://') + '/postgres'
    conn = await asyncpg.connect(clean_url)
    exists = await conn.fetchval("SELECT 1 FROM pg_database WHERE datname = 'blood_donation_test_db'")
    if not exists:
        await conn.execute("CREATE DATABASE blood_donation_test_db")
        print("SUCCESS: Created database blood_donation_test_db")
    else:
        print("SUCCESS: Database blood_donation_test_db already exists")
    await conn.close()

if __name__ == "__main__":
    asyncio.run(setup())

