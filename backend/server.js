require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, 'uploads');
const evidenceDir = path.join(__dirname, 'uploads/evidence');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}
if (!fs.existsSync(evidenceDir)) {
  fs.mkdirSync(evidenceDir);
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (req.path.includes('/evidence')) {
      cb(null, evidenceDir);
    } else {
      cb(null, uploadDir);
    }
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 }
});

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('✅ Database connected successfully');
  }
});

// =====================================================
// CRITICAL ENDPOINTS
// =====================================================

// Get all submissions (FIX THIS ONE)
app.get('/api/submissions', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM job_queue ORDER BY job_id DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching submissions:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get single submission by ID (NEW)
app.get('/api/submissions/:job_id', async (req, res) => {
  try {
    const { job_id } = req.params;
    const result = await pool.query(
      'SELECT * FROM job_queue WHERE job_id = $1',
      [job_id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Submission not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching submission:', error);
    res.status(500).json({ error: error.message });
  }
});

// Submit a job
app.post('/api/submit', upload.single('video'), async (req, res) => {
  try {
    console.log('Received submission request');
    
    let creator_id = req.body.creator_id || 1;
    let content_id;
    let job_type = req.body.job_type || 'video';
    let params = {};

    if (req.file) {
      content_id = req.file.filename;
      params = {
        filename: req.file.originalname,
        fileSize: req.file.size,
        filePath: req.file.path
      };
    } else if (req.body.url || req.body.youtubeUrl) {
      const url = req.body.url || req.body.youtubeUrl;
      content_id = `url-${Date.now()}`;
      params = { url };
      job_type = 'url';
    } else if (req.body.content_id) {
      content_id = req.body.content_id;
      job_type = req.body.job_type || 'video';
      params = req.body.params || {};
    } else {
      return res.status(400).json({
        error: 'No file, URL, or content_id provided'
      });
    }

    const result = await pool.query(
      `INSERT INTO job_queue (creator_id, content_id, job_type, status, params, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING *`,
      [creator_id, content_id, job_type, 'pending', params]
    );

    res.json({
      success: true,
      job_id: result.rows[0].job_id,
      id: result.rows[0].job_id
    });

  } catch (err) {
    console.error('Error in /api/submit:', err);
    res.status(500).json({
      error: err.message,
      details: 'Failed to create job'
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    endpoints: [
      '/api/submissions',
      '/api/submissions/:job_id',
      '/api/submit'
    ]
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: "SeekReap Tier-6 Backend Running 🚀",
    version: "2.0.0",
    features: ["Job Processing"]
  });
});

// Catch-all for 404s (MUST BE LAST)
app.use((req, res, next) => {
  console.log(`❌ 404 Not Found: ${req.method} ${req.url}`);
  res.status(404).json({
    error: 'Not Found',
    message: `Endpoint ${req.method} ${req.url} does not exist`,
    available_endpoints: [
      '/',
      '/health',
      '/api/health',
      '/api/submissions',
      '/api/submissions/:job_id',
      '/api/submit'
    ]
  });
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`✅ SeekReap Tier-6 Backend running on port ${PORT}`);
  console.log(`📡 API endpoints available:`);
  console.log(`   - GET  /health`);
  console.log(`   - GET  /api/submissions`);
  console.log(`   - GET  /api/submissions/:job_id (NEW)`);
  console.log(`   - POST /api/submit`);
});
