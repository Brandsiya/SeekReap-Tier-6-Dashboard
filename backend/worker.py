import os
import sys
import logging
import redis
from rq import Worker, Queue, Connection

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def process_video(job_id, file_path):
    """Process a video file"""
    logger.info(f"Processing video for job {job_id}: {file_path}")
    # Add your video processing logic here
    return {"status": "processing", "job_id": job_id}

def process_url(job_id, url):
    """Process a URL"""
    logger.info(f"Processing URL for job {job_id}: {url}")
    # Add your URL processing logic here
    return {"status": "processing", "job_id": job_id}

if __name__ == '__main__':
    redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379')
    redis_conn = redis.from_url(redis_url)
    
    with Connection(redis_conn):
        worker = Worker(['video_processing'])
        worker.work()
