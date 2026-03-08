from flask import Flask, jsonify
import os

app = Flask(__name__)

@app.route('/health')
def health_check():
    return jsonify({"status": "healthy", "service": "seekreap-backend"}), 200

@app.route('/')
def index():
    return "SeekReap Tier-6 API is running."

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 8080)))
