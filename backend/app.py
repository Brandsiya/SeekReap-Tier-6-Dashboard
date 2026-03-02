import os
import logging
import json
import uuid
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import RealDictCursor, Json

load_dotenv()
app = Flask(__name__)
CORS(app)

DATABASE_URL = os.getenv('DATABASE_URL')

def get_db():
    return psycopg2.connect(DATABASE_URL)

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'healthy', 'tier': 6}), 200

@app.route('/api/upload', methods=['POST'])
def upload_file():
    # Simplified for the new Tier-5 Architecture
    data = request.get_json() or {}
    job_type = data.get('job_type', 'video')
    
    try:
        conn = get_db()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            INSERT INTO submissions (job_type, status, payload)
            VALUES (%s, 'pending', %s)
            RETURNING job_id
        """, (job_type, Json(data)))
        
        job_id = cur.fetchone()['job_id']
        conn.commit()
        cur.close()
        conn.close()
        
        return jsonify({'job_id': job_id, 'status': 'pending'}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/submissions', methods=['GET'])
def get_submissions():
    conn = get_db()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT * FROM submissions ORDER BY created_at DESC LIMIT 50")
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return jsonify(rows)

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
