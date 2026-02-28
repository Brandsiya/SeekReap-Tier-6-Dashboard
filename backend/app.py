import os
import logging
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from dotenv import load_dotenv
import redis
from rq import Queue
import psycopg2
from psycopg2.extras import RealDictCursor
import uuid
from datetime import datetime
import mimetypes
import werkzeug

# Load environment variables
load_dotenv()

# Initialize Flask app
app = Flask(__name__)

# Configure CORS
FRONTEND_URL = os.getenv('FRONTEND_URL', 'https://seekreap-frontend.onrender.com')
CORS(app, origins=[FRONTEND_URL])

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Redis connection
REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379')
if REDIS_URL:
    try:
        redis_conn = redis.from_url(REDIS_URL)
        queue = Queue('video_processing', connection=redis_conn)
        logger.info(f"Connected to Redis at {REDIS_URL}")
    except Exception as e:
        logger.error(f"Redis connection error: {e}")
        redis_conn = None
        queue = None
else:
    logger.warning("REDIS_URL not set, running without queue")
    redis_conn = None
    queue = None

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

# Initialize database
def init_db():
    conn = get_db()
    if not conn:
        logger.error("Could not connect to database for initialization")
        return False
    
    try:
        cur = conn.cursor()
        # Create submissions table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS submissions (
                job_id SERIAL PRIMARY KEY,
                creator_id INTEGER NOT NULL,
                content_id TEXT NOT NULL,
                job_type TEXT NOT NULL,
                params JSONB,
                status TEXT DEFAULT 'pending',
                started_at TIMESTAMP,
                completed_at TIMESTAMP,
                failure_reason TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                submission_id TEXT UNIQUE,
                redis_job_id TEXT,
                processing_host TEXT,
                attempts INTEGER DEFAULT 0
            )
        """)
        
        # Create index for faster queries
        cur.execute("CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON submissions(created_at)")
        
        conn.commit()
        cur.close()
        conn.close()
        logger.info("Database initialized successfully")
        return True
    except Exception as e:
        logger.error(f"Database initialization error: {e}")
        return False

# Initialize DB on startup
init_db()

# ============================================
# HEALTH CHECK ENDPOINT
# ============================================
@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    db_status = "connected" if get_db() else "disconnected"
    redis_status = "connected" if redis_conn else "disconnected"
    
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'database': db_status,
        'redis': redis_status,
        'frontend_url': FRONTEND_URL
    })

# ============================================
# DATABASE INITIALIZATION ENDPOINT
# ============================================
@app.route('/api/init-db', methods=['GET'])
def initialize_database():
    """Initialize database tables"""
    try:
        success = init_db()
        if success:
            return jsonify({
                "message": "Database initialized successfully",
                "tables": ["submissions"],
                "status": "success"
            })
        else:
            return jsonify({
                "error": "Database initialization failed",
                "status": "error"
            }), 500
    except Exception as e:
        logger.error(f"Error in init-db: {e}")
        return jsonify({"error": str(e)}), 500

# ============================================
# SUBMISSIONS ENDPOINTS
# ============================================
@app.route('/api/submissions', methods=['GET'])
def get_submissions():
    """Get all submissions"""
    conn = get_db()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT * FROM submissions ORDER BY created_at DESC")
        submissions = cur.fetchall()
        cur.close()
        conn.close()
        return jsonify(submissions)
    except Exception as e:
        logger.error(f"Error fetching submissions: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/submissions/<int:job_id>', methods=['GET'])
def get_submission(job_id):
    """Get a specific submission by job_id"""
    conn = get_db()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT * FROM submissions WHERE job_id = %s", (job_id,))
        submission = cur.fetchone()
        cur.close()
        conn.close()
        
        if submission:
            return jsonify(submission)
        else:
            return jsonify({'error': 'Submission not found'}), 404
    except Exception as e:
        logger.error(f"Error fetching submission {job_id}: {e}")
        return jsonify({'error': str(e)}), 500

# ============================================
# UPLOAD ENDPOINTS
# ============================================
@app.route('/api/upload', methods=['POST'])
def upload_file():
    """Upload a video file"""
    if 'video' not in request.files:
        return jsonify({'error': 'No video file provided'}), 400
    
    file = request.files['video']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    # Validate file type
    allowed_types = ['video/mp4', 'video/quicktime', 'video/x-msvideo']
    if file.content_type not in allowed_types:
        return jsonify({'error': 'Invalid file type. Please upload MP4, MOV, or AVI'}), 400
    
    # Generate job ID
    content_id = str(uuid.uuid4())
    filename = werkzeug.utils.secure_filename(file.filename)
    
    # Create uploads directory if it doesn't exist
    os.makedirs('uploads', exist_ok=True)
    
    # Save file temporarily
    upload_path = os.path.join('uploads', f"{content_id}_{filename}")
    file.save(upload_path)
    logger.info(f"File saved to {upload_path}")
    
    # Create submission in database
    conn = get_db()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            INSERT INTO submissions (creator_id, content_id, job_type, params, status)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING job_id
        """, (
            1,  # Default creator_id
            content_id,
            'video',
            {'filePath': upload_path, 'filename': filename, 'fileSize': os.path.getsize(upload_path)},
            'pending'
        ))
        
        result = cur.fetchone()
        job_id = result['job_id']
        conn.commit()
        
        # Queue the job for processing if Redis is available
        redis_job_id = None
        if queue:
            try:
                from worker import process_video
                redis_job = queue.enqueue('process_video', job_id, upload_path)
                redis_job_id = redis_job.id
                
                # Update with redis job id
                cur.execute("UPDATE submissions SET redis_job_id = %s WHERE job_id = %s", 
                           (redis_job_id, job_id))
                conn.commit()
                logger.info(f"Job {job_id} queued with Redis ID: {redis_job_id}")
            except Exception as e:
                logger.error(f"Failed to queue job {job_id}: {e}")
        
        cur.close()
        conn.close()
        
        return jsonify({
            'job_id': job_id,
            'content_id': content_id,
            'status': 'pending',
            'redis_job_id': redis_job_id,
            'message': 'Video uploaded successfully'
        }), 201
        
    except Exception as e:
        logger.error(f"Error creating submission: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/upload/url', methods=['POST'])
def upload_url():
    """Submit a URL for processing"""
    data = request.get_json()
    if not data or 'url' not in data:
        return jsonify({'error': 'No URL provided'}), 400
    
    url = data['url']
    
    # Validate URL
    if not url.startswith(('http://', 'https://')):
        return jsonify({'error': 'Invalid URL format'}), 400
    
    content_id = 'url-' + str(uuid.uuid4())
    
    # Create submission in database
    conn = get_db()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            INSERT INTO submissions (creator_id, content_id, job_type, params, status)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING job_id
        """, (
            1,  # Default creator_id
            content_id,
            'url',
            {'url': url},
            'pending'
        ))
        
        result = cur.fetchone()
        job_id = result['job_id']
        conn.commit()
        
        # Queue the job for processing if Redis is available
        redis_job_id = None
        if queue:
            try:
                from worker import process_url
                redis_job = queue.enqueue('process_url', job_id, url)
                redis_job_id = redis_job.id
                
                # Update with redis job id
                cur.execute("UPDATE submissions SET redis_job_id = %s WHERE job_id = %s", 
                           (redis_job_id, job_id))
                conn.commit()
                logger.info(f"Job {job_id} queued with Redis ID: {redis_job_id}")
            except Exception as e:
                logger.error(f"Failed to queue job {job_id}: {e}")
        
        cur.close()
        conn.close()
        
        return jsonify({
            'job_id': job_id,
            'content_id': content_id,
            'status': 'pending',
            'redis_job_id': redis_job_id,
            'message': 'URL submitted successfully'
        }), 201
        
    except Exception as e:
        logger.error(f"Error creating submission: {e}")
        return jsonify({'error': str(e)}), 500

# ============================================
# RESULTS ENDPOINT
# ============================================
@app.route('/api/results/<int:job_id>', methods=['GET'])
def get_results(job_id):
    """Get processed video results"""
    conn = get_db()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT * FROM submissions WHERE job_id = %s", (job_id,))
        job = cur.fetchone()
        cur.close()
        conn.close()
        
        if not job:
            return jsonify({'error': 'Job not found'}), 404
        
        if job['status'] != 'completed':
            return jsonify({
                'error': 'Job not completed',
                'status': job['status'],
                'job_id': job_id
            }), 400
        
        # For now, return a placeholder
        # In production, this would serve the actual processed video
        return jsonify({
            'job_id': job_id,
            'status': 'completed',
            'message': 'Results endpoint - video would be served here',
            'video_url': f'/api/video/{job_id}'
        })
        
    except Exception as e:
        logger.error(f"Error fetching results for job {job_id}: {e}")
        return jsonify({'error': str(e)}), 500

# ============================================
# ROOT ENDPOINT
# ============================================
@app.route('/', methods=['GET'])
def root():
    """Root endpoint with API information"""
    return jsonify({
        'name': 'SeekReap Tier-6 Backend API',
        'version': '1.0.0',
        'status': 'operational',
        'endpoints': [
            '/health',
            '/api/init-db',
            '/api/submissions',
            '/api/submissions/<job_id>',
            '/api/upload',
            '/api/upload/url',
            '/api/results/<job_id>'
        ],
        'documentation': 'https://github.com/Brandsiya/SeekReap-Tier-6-Backend'
    })

# ============================================
# ERROR HANDLERS
# ============================================
@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500

# ============================================
# MAIN ENTRY POINT
# ============================================
if __name__ == '__main__':
    # Initialize database
    init_db()
    
    # Create necessary directories
    os.makedirs('uploads', exist_ok=True)
    os.makedirs('processed', exist_ok=True)
    os.makedirs('logs', exist_ok=True)
    os.makedirs('temp', exist_ok=True)
    
    # Run app
    port = int(os.getenv('PORT', 5000))
    debug = os.getenv('FLASK_DEBUG', '0') == '1'
    app.run(host='0.0.0.0', port=port, debug=debug)
