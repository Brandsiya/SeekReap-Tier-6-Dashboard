from flask import Flask, jsonify, request
import os
import time
import psycopg2

app = Flask(__name__)

DB_URL = os.environ.get(
    "DATABASE_URL",
    "postgres://neondb_owner:npg_yX7aHMwIqQC4@ep-rapid-base-ai27r1sa-pooler.c-4.us-east-1.aws.neon.tech/seekreap_neon_db?sslmode=require"
)

# ---------------------------------------------------------------------------
# /health — instant liveness (no DB). Cloud Run hits this on every request.
# ---------------------------------------------------------------------------
@app.route('/health')
def health_check():
    return jsonify({
        "status":    "healthy",
        "service":   "seekreap-backend",
        "tier":      6,
        "timestamp": __import__('datetime').datetime.utcnow().isoformat(),
    }), 200

# ---------------------------------------------------------------------------
# /ready — deep readiness check with DB ping. Call manually / from monitoring.
# ---------------------------------------------------------------------------
@app.route('/ready')
def ready_check():
    start = time.time()
    try:
        conn = psycopg2.connect(DB_URL)
        cur  = conn.cursor()
        cur.execute("SELECT 1")
        cur.close()
        conn.close()
        return jsonify({
            "status":     "ready",
            "db":         "connected",
            "latency_ms": round((time.time() - start) * 1000, 1),
        }), 200
    except Exception as e:
        return jsonify({"status": "not_ready", "db": "error", "detail": str(e)}), 503

# ---------------------------------------------------------------------------
# /analyze — queue a video for processing
# ---------------------------------------------------------------------------
@app.route('/analyze', methods=['POST'])
def analyze_video():
    data     = request.json or {}
    video_id = data.get('video_id')

    if not video_id:
        return jsonify({"error": "Missing video_id"}), 400

    try:
        conn = psycopg2.connect(DB_URL)
        cur  = conn.cursor()
        cur.execute(
            "INSERT INTO video_patterns (video_id, status) VALUES (%s, 'pending') "
            "ON CONFLICT (video_id) DO NOTHING",
            (video_id,),
        )
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"message": f"Video {video_id} queued for analysis"}), 202
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 8080)))

# ---------------------------------------------------------------------------
# CORS — allow Firebase Hosting origin
# ---------------------------------------------------------------------------
@app.after_request
def add_cors(response):
    origin = request.headers.get('Origin', '')
    if 'seekreap' in origin or 'localhost' in origin:
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, X-Creator-ID'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    return response

@app.route('/api/creator/profile', methods=['GET', 'OPTIONS'])
def creator_profile():
    if request.method == 'OPTIONS':
        return '', 204
    firebase_uid = request.headers.get('X-Creator-ID', '').strip()
    if not firebase_uid:
        return jsonify({"error": "Missing X-Creator-ID header"}), 401
    import uuid as _uuid
    creator_uuid = str(_uuid.uuid5(_uuid.NAMESPACE_URL, firebase_uid))
    try:
        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()
        cur.execute(
            "SELECT id, email, name, subscription_tier, credits_remaining FROM creators WHERE id = %s",
            (creator_uuid,)
        )
        row = cur.fetchone()
        cur.close(); conn.close()
        if not row:
            return jsonify({"error": "Creator not found"}), 404
        return jsonify({
            "id":                 str(row[0]),
            "email":              row[1] or "",
            "name":               row[2] or "",
            "subscription_tier":  row[3] or "free",
            "credits_remaining":  row[4] or 0,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/submissions', methods=['GET', 'OPTIONS'])
def get_submissions():
    if request.method == 'OPTIONS':
        return '', 204
    firebase_uid = request.headers.get('X-Creator-ID', '').strip()
    if not firebase_uid:
        return jsonify({"error": "Missing X-Creator-ID header"}), 401
    import uuid as _uuid, json as _json
    creator_uuid = str(_uuid.uuid5(_uuid.NAMESPACE_URL, firebase_uid))
    try:
        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()
        cur.execute("""
            SELECT id, content_url, status, overall_risk_score, risk_level,
                   submitted_at, completed_at, metadata
            FROM submissions
            WHERE creator_id = %s
            ORDER BY submitted_at DESC
            LIMIT 50
        """, (creator_uuid,))
        rows = cur.fetchall()
        cur.close(); conn.close()
        submissions = []
        for r in rows:
            meta = r[7] or {}
            if isinstance(meta, str):
                try: meta = _json.loads(meta)
                except: meta = {}
            submissions.append({
                "id":                  str(r[0]),
                "content_url":         r[1] or "",
                "status":              r[2] or "pending",
                "overall_risk_score":  float(r[3]) if r[3] is not None else None,
                "risk_level":          r[4] or "",
                "submitted_at":        r[5].isoformat() if r[5] else None,
                "completed_at":        r[6].isoformat() if r[6] else None,
                "title":               meta.get("title", ""),
                "channel":             meta.get("channel", ""),
            })
        return jsonify({"submissions": submissions, "total": len(submissions)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
