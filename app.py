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
