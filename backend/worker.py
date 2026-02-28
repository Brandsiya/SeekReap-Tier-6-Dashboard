import os
import sys
import logging
import time
import redis
from rq import Worker, Queue, Connection
from rq.job import Job
import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Database connection
def get_db():
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
    """Update job status in database"""
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

def process_video(job_id, file_path):
    """Process a video file"""
    logger.info(f"Starting video processing for job {job_id}: {file_path}")
    
    try:
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
        time.sleep(10)  # Simulate work
        
        # Update status to completed
        update_job_status(job_id, 'completed', completed_at=datetime.now())
        
        logger.info(f"Video processing completed for job {job_id}")
        return {"status": "completed", "job_id": job_id, "result": "Video processed successfully"}
        
    except Exception as e:
        logger.error(f"Error processing video for job {job_id}: {e}")
        update_job_status(job_id, 'failed', failure_reason=str(e), completed_at=datetime.now())
        return {"status": "failed", "job_id": job_id, "error": str(e)}

def process_url(job_id, url):
    """Process a URL"""
    logger.info(f"Starting URL processing for job {job_id}: {url}")
    
    try:
        # Update status to processing
        update_job_status(job_id, 'processing', started_at=datetime.now())
        
        # TODO: Add actual URL processing logic here
        # This is where you would:
        # 1. Download video from URL
        # 2. Process the video
        # 3. Generate results
        
        # Simulate processing time
        logger.info(f"Processing URL for job {job_id}...")
        time.sleep(8)  # Simulate work
        
        # Update status to completed
        update_job_status(job_id, 'completed', completed_at=datetime.now())
        
        logger.info(f"URL processing completed for job {job_id}")
        return {"status": "completed", "job_id": job_id, "result": "URL processed successfully"}
        
    except Exception as e:
        logger.error(f"Error processing URL for job {job_id}: {e}")
        update_job_status(job_id, 'failed', failure_reason=str(e), completed_at=datetime.now())
        return {"status": "failed", "job_id": job_id, "error": str(e)}

if __name__ == '__main__':
    # Get Redis URL from environment
    redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379')
    
    try:
        redis_conn = redis.from_url(redis_url)
        logger.info(f"Worker connected to Redis at {redis_url}")
        
        # Start worker
        with Connection(redis_conn):
            worker = Worker(['video_processing'])
            logger.info("Worker started, listening for jobs...")
            worker.work()
            
    except Exception as e:
        logger.error(f"Worker failed to start: {e}")
        sys.exit(1)
