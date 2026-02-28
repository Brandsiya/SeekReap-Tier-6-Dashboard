import os
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def run_migration():
    """Create PGQueuer tables in PostgreSQL"""
    DATABASE_URL = os.getenv('DATABASE_URL')
    if not DATABASE_URL:
        print("❌ DATABASE_URL not set in .env file")
        return False
    
    try:
        # Connect to database
        conn = psycopg2.connect(DATABASE_URL)
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cur = conn.cursor()
        
        print("✅ Connected to database")
        
        # Create pgq_job table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS pgq_job (
                id BIGSERIAL PRIMARY KEY,
                queue_name TEXT NOT NULL,
                priority INTEGER NOT NULL DEFAULT 0,
                data BYTEA NOT NULL,
                enqueued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                locked_by TEXT,
                locked_at TIMESTAMPTZ,
                attempts INTEGER NOT NULL DEFAULT 0,
                last_error TEXT
            )
        """)
        print("✅ Created pgq_job table")
        
        # Create indexes
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_pgq_job_scheduled 
            ON pgq_job(scheduled_at) WHERE locked_by IS NULL
        """)
        print("✅ Created scheduled_at index")
        
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_pgq_job_queue 
            ON pgq_job(queue_name)
        """)
        print("✅ Created queue_name index")
        
        cur.close()
        conn.close()
        print("🎉 Migration completed successfully!")
        return True
        
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        return False

if __name__ == "__main__":
    run_migration()
