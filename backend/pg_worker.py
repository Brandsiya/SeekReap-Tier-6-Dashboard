import asyncio
import asyncpg
import json
import logging
import os
from datetime import datetime
from pgqueuer import PgQueuer
from pgqueuer.db import AsyncpgDriver
from pgqueuer.models import Job
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Database connection for status updates (using psycopg2 for sync operations)
import psycopg2
from psycopg2.extras import RealDictCursor

def get_db():
    """Get sync database connection for status updates"""
    DATABASE_URL = os.getenv('DATABASE_URL')
    if not DATABASE_URL:
        logger.error("DATABASE_URL not set")
        return None
    try:
        conn = psycopg2.connect(DATABASE_URL)
        return conn
    except Exception as e:
        logger.error(f"Database connection error: {e}")
        return None

def update_job_status(job_id, status, **kwargs):
    """Update job status in submissions table"""
    conn = get_db()
    if not conn:
        logger.error(f"Failed to update job {job_id}: no database connection")
        return False
    
    try:
        cur = conn.cursor()
        
        # Build the SET part of the query dynamically
        set_fields = ["status = %s"]
        params = [status]
        
        if 'started_at' in kwargs and kwargs['started_at']:
            set_fields.append("started_at = %s")
            params.append(kwargs['started_at'])
        
        if 'completed_at' in kwargs and kwargs['completed_at']:
            set_fields.append("completed_at = %s")
            params.append(kwargs['completed_at'])
        
        if 'failure_reason' in kwargs and kwargs['failure_reason']:
            set_fields.append("failure_reason = %s")
            params.append(kwargs['failure_reason'])
        
        # Add job_id to params
        params.append(job_id)
        
        query = f"UPDATE submissions SET {', '.join(set_fields)} WHERE job_id = %s"
        cur.execute(query, params)
        conn.commit()
        cur.close()
        conn.close()
        
        logger.info(f"Updated job {job_id} status to {status}")
        return True
    except Exception as e:
        logger.error(f"Error updating job {job_id}: {e}")
        return False

async def process_video_job(job: Job) -> None:
    """Process a video job from the queue"""
    try:
        # In PGQueuer 0.25.3, the job payload is in job.payload
        # The job.id is the job_id
        job_data = json.loads(job.payload.decode())
        job_id = job_data.get('job_id')
        file_path = job_data.get('file_path')
        
        if not job_id:
            logger.error(f"Job missing job_id: {job_data}")
            return
        
        logger.info(f"🎬 Starting video processing for job {job_id}: {file_path}")
        
        # Update status to processing
        update_job_status(job_id, 'processing', started_at=datetime.now())
        
        # TODO: Add actual video processing logic here
        # This is where you would:
        # 1. Analyze the video
        # 2. Extract metadata
        # 3. Detect content
        # 4. Generate results
        
        # Simulate processing time
        logger.info(f"Processing video for job {job_id}...")
        await asyncio.sleep(10)  # Simulate work
        
        # Update status to completed
        update_job_status(job_id, 'completed', completed_at=datetime.now())
        
        logger.info(f"✅ Video processing completed for job {job_id}")
        
    except Exception as e:
        logger.error(f"❌ Error processing video job: {e}")
        if 'job_id' in locals():
            update_job_status(job_id, 'failed', failure_reason=str(e), completed_at=datetime.now())

async def process_url_job(job: Job) -> None:
    """Process a URL job from the queue"""
    try:
        # In PGQueuer 0.25.3, the job payload is in job.payload
        job_data = json.loads(job.payload.decode())
        job_id = job_data.get('job_id')
        url = job_data.get('url')
        
        if not job_id:
            logger.error(f"Job missing job_id: {job_data}")
            return
        
        logger.info(f"🔗 Starting URL processing for job {job_id}: {url}")
        
        # Update status to processing
        update_job_status(job_id, 'processing', started_at=datetime.now())
        
        # TODO: Add actual URL processing logic here
        # This is where you would:
        # 1. Download video from URL
        # 2. Process the video
        # 3. Generate results
        
        # Simulate processing time
        logger.info(f"Processing URL for job {job_id}...")
        await asyncio.sleep(8)  # Simulate work
        
        # Update status to completed
        update_job_status(job_id, 'completed', completed_at=datetime.now())
        
        logger.info(f"✅ URL processing completed for job {job_id}")
        
    except Exception as e:
        logger.error(f"❌ Error processing URL job: {e}")
        if 'job_id' in locals():
            update_job_status(job_id, 'failed', failure_reason=str(e), completed_at=datetime.now())

async def main():
    """Main worker entry point"""
    DATABASE_URL = os.getenv('DATABASE_URL')
    if not DATABASE_URL:
        logger.error("❌ DATABASE_URL not set")
        return
    
    logger.info(f"📋 Connecting to database...")
    
    try:
        # Connect to PostgreSQL
        conn = await asyncpg.connect(DATABASE_URL)
        driver = AsyncpgDriver(conn)
        pgq = PgQueuer(driver)
        
        logger.info("✅ Connected to database")
        
        # Register job handlers
        @pgq.entrypoint("video-process")
        async def video_handler(job: Job):
            await process_video_job(job)
        
        @pgq.entrypoint("url-process")
        async def url_handler(job: Job):
            await process_url_job(job)
        
        logger.info("🚀 PGQueuer worker started, listening for jobs...")
        logger.info("   - Registered handlers: video-process, url-process")
        
        # Run the worker
        await pgq.run()
        
    except Exception as e:
        logger.error(f"❌ Worker failed to start: {e}")
        raise

if __name__ == "__main__":
    asyncio.run(main())
