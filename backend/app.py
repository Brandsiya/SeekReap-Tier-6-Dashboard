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
CORS(app, origins=[os.getenv('FRONTEND_URL', 'https://seekreap-frontend.onrender.com')])

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Redis connection
redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379')
redis_conn = redis.from_url(redis_url)
queue = Queue('video_processing', connection=redis_conn)

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
        return
    
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
        conn.commit()
        cur.close()
        conn.close()
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error(f"Database initialization error: {e}")

# Routes
@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'healthy', 'timestamp': datetime.now().isoformat()})

@app.route('/api/submissions', methods=['GET'])
def get_submissions():
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

@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'video' not in request.files:
        return jsonify({'error': 'No video file provided'}), 400
    
    file = request.files['video']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    # Generate job ID
    content_id = str(uuid.uuid4())
    filename = werkzeug.utils.secure_filename(file.filename)
    
    # Save file temporarily
    upload_path = os.path.join('uploads', content_id + '_' + filename)
    file.save(upload_path)
    
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
        """, (1, content_id, 'video', {'filePath': upload_path, 'filename': filename}, 'pending'))
        
        job_id = cur.fetchone()['job_id']
        conn.commit()
        
        # Queue the job for processing
        redis_job = queue.enqueue('process_video', job_id, upload_path)
        
        # Update with redis job id
        cur.execute("UPDATE submissions SET redis_job_id = %s WHERE job_id = %s", 
                   (redis_job.id, job_id))
        conn.commit()
        
        cur.close()
        conn.close()
        
        return jsonify({
            'job_id': job_id,
            'content_id': content_id,
            'status': 'pending',
            'message': 'Video uploaded successfully'
        }), 201
        
    except Exception as e:
        logger.error(f"Error creating submission: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/upload/url', methods=['POST'])
def upload_url():
    data = request.get_json()
    if not data or 'url' not in data:
        return jsonify({'error': 'No URL provided'}), 400
    
    url = data['url']
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
        """, (1, content_id, 'url', {'url': url}, 'pending'))
        
        job_id = cur.fetchone()['job_id']
        conn.commit()
        
        # Queue the job for processing
        redis_job = queue.enqueue('process_url', job_id, url)
        
        # Update with redis job id
        cur.execute("UPDATE submissions SET redis_job_id = %s WHERE job_id = %s", 
                   (redis_job.id, job_id))
        conn.commit()
        
        cur.close()
        conn.close()
        
        return jsonify({
            'job_id': job_id,
            'content_id': content_id,
            'status': 'pending',
            'message': 'URL submitted successfully'
        }), 201
        
    except Exception as e:
        logger.error(f"Error creating submission: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/results/<int:job_id>', methods=['GET'])
def get_results(job_id):
    # This endpoint would serve the processed video
    # For now, return a placeholder
    return jsonify({'message': 'Results endpoint', 'job_id': job_id})

if __name__ == '__main__':
    # Initialize database
    init_db()
    
    # Create uploads directory if it doesn't exist
    os.makedirs('uploads', exist_ok=True)
    os.makedirs('processed', exist_ok=True)
    
    # Run app
    port = int(os.getenv('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
