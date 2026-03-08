import asyncio
import asyncpg
import os

async def test_connection():
    database_url = os.getenv('DATABASE_URL')
    print(f"Connecting to: {database_url}")
    try:
        conn = await asyncpg.connect(database_url)
        print("✅ Connection successful!")
        await conn.close()
    except Exception as e:
        print(f"❌ Connection failed: {e}")

asyncio.run(test_connection())
