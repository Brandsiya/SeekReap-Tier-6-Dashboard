import os
import uuid
import psycopg2
from flask import Flask, request, jsonify
from flask_cors import CORS
from psycopg2.extras import RealDictCursor, Json
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

def get_db_connection():
    return psycopg2.connect(os.getenv('DATABASE_URL'))

@app.route('/api/submit-scan', methods=['POST'])
def submit_scan():
    data = request.json
    submission_id = str(uuid.uuid4())
    
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Mapping frontend data to your existing 'submissions' table
        cur.execute("""
            INSERT INTO submissions (
                id, title, content_url, metadata, status, scan_tier, submitted_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (
            submission_id,
            data.get('name', 'Untitled Scan'),
            data.get('url', 'local_upload'),
            Json(data),
            'processing',
            data.get('tier', 6),
            datetime.now()
        ))
        
        conn.commit()
        cur.close()
        conn.close()
        
        return jsonify({"status": "success", "submission_id": submission_id}), 201
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))

@app.route('/health')
def health_check():
    return {"status": "healthy", "service": "seekreap-backend"}, 200
