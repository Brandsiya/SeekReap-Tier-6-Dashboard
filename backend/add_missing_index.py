import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

async def add_missing_index():
    """Add the missing pgqueuer_log_job_id_status index"""
    DATABASE_URL = os.getenv('DATABASE_URL')
    if not DATABASE_URL:
        print("❌ DATABASE_URL not set in .env file")
        return False
    
    print(f"📋 Connecting to database...")
    
    try:
        conn = await asyncpg.connect(DATABASE_URL)
        print("✅ Connected to database")
        
        # Check if the index already exists
        result = await conn.fetchval("""
            SELECT EXISTS (
                SELECT 1
                FROM pg_indexes
                WHERE indexname = 'pgqueuer_log_job_id_status'
            )
        """)
        
        if result:
            print("✅ Index 'pgqueuer_log_job_id_status' already exists")
        else:
            print("⚠️ Index not found, creating it now...")
            
            # Create the missing index
            await conn.execute("""
                CREATE INDEX pgqueuer_log_job_id_status 
                ON pgqueuer_log (job_id, created DESC)
            """)
            print("✅ Created index 'pgqueuer_log_job_id_status'")
        
        # Verify all required indexes exist
        required_indexes = [
            'pgqueuer_priority_id_id1_idx',
            'pgqueuer_updated_id_id1_idx',
            'pgqueuer_queue_manager_id_idx',
            'pgqueuer_unique_dedupe_key',
            'pgqueuer_log_not_aggregated',
            'pgqueuer_log_created',
            'pgqueuer_log_status',
            'pgqueuer_log_job_id_status',
            'pgqueuer_statistics_unique_count'
        ]
        
        print("\n📊 Checking all required indexes:")
        for index_name in required_indexes:
            exists = await conn.fetchval("""
                SELECT EXISTS (
                    SELECT 1
                    FROM pg_indexes
                    WHERE indexname = $1
                )
            """, index_name)
            
            if exists:
                print(f"  ✅ {index_name}")
            else:
                print(f"  ⚠️ {index_name} is MISSING")
        
        await conn.close()
        print("\n🎉 Database check complete!")
        return True
        
    except Exception as e:
        print(f"❌ Failed to connect or create index: {e}")
        return False

if __name__ == "__main__":
    asyncio.run(add_missing_index())
