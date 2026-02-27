require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');

const app = express();

// CORS configuration
app.use(cors({
  origin: ['https://seekreap.netlify.app', 'http://localhost:3000'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection error:', err);
  } else {
    console.log('✅ Database connected successfully');
  }
});

// Tier-5 URL
const TIER5_URL = process.env.TIER5_URL || 'https://seekreap-tier-5-orchestrator.onrender.com';

// =====================================================
// API Endpoints
// =====================================================

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    tier: 6,
    endpoints: [
      '/api/submissions',
      '/api/submissions/:job_id',
      '/api/submit'
    ]
  });
});

// Get all submissions
app.get('/api/submissions', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM job_queue ORDER BY job_id DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error fetching submissions:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get single submission by ID
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
    console.error('❌ Error fetching submission:', error);
    res.status(500).json({ error: error.message });
  }
});

// Submit a job (handles both file uploads and URL submissions)
app.post('/api/submit', upload.single('video'), async (req, res) => {
  try {
    console.log('📥 Received submission request');
    
    let creator_id = req.body.creator_id || 1;
    let content_id;
    let job_type = req.body.job_type || 'video';
    let params = {};

    // Handle file upload
    if (req.file) {
      content_id = req.file.filename;
      params = {
        filename: req.file.originalname,
        fileSize: req.file.size,
        filePath: req.file.path
      };
      console.log(`📁 File upload: ${req.file.originalname}`);
    } 
    // Handle URL submission
    else if (req.body.url || req.body.youtubeUrl) {
      const url = req.body.url || req.body.youtubeUrl;
      content_id = `url-${Date.now()}`;
      params = { url };
      job_type = 'url';
      console.log(`🔗 URL submission: ${url}`);
    } 
    // Handle direct job creation (for testing)
    else if (req.body.content_id) {
      content_id = req.body.content_id;
      job_type = req.body.job_type || 'video';
      params = req.body.params || {};
      console.log(`📝 Direct job: ${content_id}`);
    } 
    else {
      return res.status(400).json({
        error: 'No file, URL, or content_id provided'
      });
    }

    // Save to database
    const result = await pool.query(
      `INSERT INTO job_queue (creator_id, content_id, job_type, status, params, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING *`,
      [creator_id, content_id, job_type, 'pending', params]
    );

    const job = result.rows[0];
    console.log(`✅ Job ${job.job_id} saved to database`);

    // Forward to Tier-5
    try {
      const tier5Response = await fetch(`${TIER5_URL}/api/redis-job`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creator_id: creator_id,
          content_id: content_id,
          job_type: job_type,
          params: params
        })
      });

      if (tier5Response.ok) {
        const tier5Result = await tier5Response.json();
        console.log(`✅ Job ${job.job_id} forwarded to Tier-5`);
        
        // Update with Redis job ID
        await pool.query(
          'UPDATE job_queue SET redis_job_id = $1 WHERE job_id = $2',
          [tier5Result.redis_job_id || tier5Result.pg_job_id, job.job_id]
        );
      }
    } catch (forwardError) {
      console.log(`⚠️ Could not forward to Tier-5: ${forwardError.message}`);
    }

    res.json({
      success: true,
      job_id: job.job_id,
      id: job.job_id,
      status: 'pending',
      message: 'Job created successfully'
    });

  } catch (err) {
    console.error('❌ Error in /api/submit:', err);
    res.status(500).json({
      error: err.message,
      details: 'Failed to create job'
    });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: "SeekReap Tier-6 Backend Running 🚀",
    version: "2.1.0",
    features: [
      "Job Processing",
      "Tier-5 Integration",
      "Pre-flag Content Checking",
      "Demonetization Appeals",
      "Creator Dashboard",
      "Moderation Queue"
    ]
  });
});

// Serve uploaded files (optional)
app.use('/uploads', express.static('uploads'));

// Start server - BIND TO 0.0.0.0 for Render!
const PORT = process.env.PORT || 3002;
app.listen(PORT, '0.0.0.0', '0.0.0.0', () => {
  console.log(`✅ SeekReap Tier-6 Backend running on port ${PORT}`);
  console.log(`📡 API endpoints available:`);
  console.log(`   - GET  /health`);
  console.log(`   - GET  /api/submissions`);
  console.log(`   - GET  /api/submissions/:job_id`);
  console.log(`   - POST /api/submit (handles files & URLs)`);
  console.log(`🔄 Tier-5 URL: ${TIER5_URL}`);
});

// Catch-all for 404s
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Endpoint ${req.method} ${req.url} does not exist`
  });
});
