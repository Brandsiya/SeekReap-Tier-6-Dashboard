require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');

const app = express();

// Middleware
app.use(cors({
  origin: ['https://seekreap.netlify.app', 'http://localhost:3000'],
  credentials: true
}));
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

// =====================================================
// TIER-5 CONFIGURATION
// =====================================================
const TIER5_URL = 'https://seekreap-tier-5-orchestrator.onrender.com';

// =====================================================
// JOB ENDPOINTS
// =====================================================

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

// Submit a job - FORWARDS TO TIER-5!
app.post('/api/submit', upload.single('video'), async (req, res) => {
  try {
    console.log('📥 Received submission request');

    let creator_id = req.body.creator_id || 1;
    let content_id;
    let job_type = req.body.job_type || 'video';
    let params = {};

    // Handle different submission types
    if (req.file) {
      // File upload
      content_id = req.file.filename;
      params = {
        filename: req.file.originalname,
        fileSize: req.file.size,
        filePath: req.file.path
      };
    } else if (req.body.url || req.body.youtubeUrl) {
      // YouTube URL submission
      const url = req.body.url || req.body.youtubeUrl;
      content_id = `url-${Date.now()}`;
      params = { url };
      job_type = 'url';
    } else if (req.body.content_id) {
      // Direct job creation (for testing)
      content_id = req.body.content_id;
      job_type = req.body.job_type || 'video';
      params = req.body.params || {};
    } else {
      return res.status(400).json({
        error: 'No file, URL, or content_id provided'
      });
    }

    console.log(`📝 Creating job: type=${job_type}, content_id=${content_id}`);

    // STEP 1: Save to local database (Tier-6)
    const result = await pool.query(
      `INSERT INTO job_queue (creator_id, content_id, job_type, status, params, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING *`,
      [creator_id, content_id, job_type, 'pending', params]
    );

    const job = result.rows[0];
    console.log(`✅ Job ${job.job_id} saved to Tier-6 database`);

    // STEP 2: Forward to Tier-5 for processing!
    let redisJobId = null;
    try {
      console.log(`🔄 Forwarding job ${job.job_id} to Tier-5...`);
      
      const tier5Response = await fetch(`${TIER5_URL}/api/redis-job`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          creator_id: creator_id,
          content_id: content_id,
          job_type: job_type,
          params: params
        })
      });

      if (tier5Response.ok) {
        const tier5Result = await tier5Response.json();
        redisJobId = tier5Result.redis_job_id;
        console.log(`✅ Job ${job.job_id} forwarded to Tier-5, Redis ID: ${redisJobId}`);
        
        // Update the job with Redis ID
        await pool.query(
          'UPDATE job_queue SET redis_job_id = $1 WHERE job_id = $2',
          [redisJobId, job.job_id]
        );
      } else {
        console.error(`❌ Failed to forward job ${job.job_id} to Tier-5: ${tier5Response.status}`);
        const errorText = await tier5Response.text();
        console.error('Tier-5 response:', errorText);
      }
    } catch (forwardError) {
      console.error(`❌ Error forwarding to Tier-5:`, forwardError.message);
      // Don't fail the request - job is still saved locally
    }

    // Return success with job details
    res.json({
      success: true,
      job_id: job.job_id,
      id: job.job_id,
      redis_job_id: redisJobId,
      status: 'pending',
      message: redisJobId 
        ? 'Job created and queued for processing' 
        : 'Job created but queuing failed - will be processed later'
    });

  } catch (err) {
    console.error('❌ Error in /api/submit:', err);
    res.status(500).json({
      error: err.message,
      details: 'Failed to create job'
    });
  }
});

// =====================================================
// PRE-FLAG ENDPOINTS
// =====================================================

// Submit content for pre-flag checking
app.post('/api/precheck', upload.fields([
  { name: 'video', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 }
]), async (req, res) => {
  try {
    console.log('📝 Pre-flag submission received');
    res.json({ 
      success: true, 
      message: 'Pre-flag endpoint - under construction',
      received: req.body 
    });
  } catch (err) {
    console.error('❌ Error in /api/precheck:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get pre-flag results
app.get('/api/precheck/:submissionId', async (req, res) => {
  try {
    res.json({ 
      message: 'Pre-flag results endpoint - under construction',
      submissionId: req.params.submissionId 
    });
  } catch (err) {
    console.error('❌ Error fetching precheck results:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get all pre-flag submissions for a creator
app.get('/api/creator/:creatorId/prechecks', async (req, res) => {
  try {
    res.json({ 
      message: 'Creator prechecks endpoint - under construction',
      creatorId: req.params.creatorId 
    });
  } catch (err) {
    console.error('❌ Error fetching creator prechecks:', err);
    res.status(500).json({ error: err.message });
  }
});

// =====================================================
// APPEAL ENDPOINTS
// =====================================================

// Submit an appeal
app.post('/api/appeals', async (req, res) => {
  try {
    console.log('📝 Appeal submission received');
    res.json({ 
      success: true, 
      message: 'Appeal endpoint - under construction',
      received: req.body 
    });
  } catch (err) {
    console.error('❌ Error in /api/appeals:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get appeal details
app.get('/api/appeals/:appealId', async (req, res) => {
  try {
    res.json({ 
      message: 'Appeal details endpoint - under construction',
      appealId: req.params.appealId 
    });
  } catch (err) {
    console.error('❌ Error fetching appeal:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get all appeals for a creator
app.get('/api/creator/:creatorId/appeals', async (req, res) => {
  try {
    res.json({ 
      message: 'Creator appeals endpoint - under construction',
      creatorId: req.params.creatorId 
    });
  } catch (err) {
    console.error('❌ Error fetching creator appeals:', err);
    res.status(500).json({ error: err.message });
  }
});

// =====================================================
// DASHBOARD & POLICY ENDPOINTS
// =====================================================

// Creator dashboard stats
app.get('/api/creator/:creatorId/dashboard', async (req, res) => {
  try {
    res.json({
      total_jobs: 0,
      pending_jobs: 0,
      completed_jobs: 0,
      failed_jobs: 0,
      message: 'Dashboard endpoint - under construction'
    });
  } catch (err) {
    console.error('❌ Error fetching dashboard:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get policy categories
app.get('/api/policies', async (req, res) => {
  try {
    res.json({ 
      message: 'Policies endpoint - under construction',
      policies: []
    });
  } catch (err) {
    console.error('❌ Error fetching policies:', err);
    res.status(500).json({ error: err.message });
  }
});

// =====================================================
// ADMIN/MODERATION ENDPOINTS
// =====================================================

// Get pending appeals
app.get('/api/admin/appeals/pending', async (req, res) => {
  try {
    res.json({ 
      message: 'Pending appeals endpoint - under construction',
      appeals: []
    });
  } catch (err) {
    console.error('❌ Error fetching pending appeals:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update appeal status
app.patch('/api/admin/appeals/:appealId/status', async (req, res) => {
  try {
    res.json({ 
      success: true, 
      message: 'Appeal status update endpoint - under construction',
      appealId: req.params.appealId 
    });
  } catch (err) {
    console.error('❌ Error updating appeal status:', err);
    res.status(500).json({ error: err.message });
  }
});

// =====================================================
// HEALTH AND UTILITY ENDPOINTS
// =====================================================

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    tier: 6,
    services: {
      database: 'connected',
      tier5: TIER5_URL
    },
    endpoints: [
      '/api/submissions',
      '/api/submissions/:job_id',
      '/api/submit',
      '/api/precheck',
      '/api/precheck/:id',
      '/api/creator/:id/prechecks',
      '/api/appeals',
      '/api/appeals/:id',
      '/api/creator/:id/appeals',
      '/api/creator/:id/dashboard',
      '/api/policies',
      '/api/admin/appeals/pending',
      '/api/admin/appeals/:id/status'
    ]
  });
});

// Also handle /api/health for compatibility
app.get('/api/health', (req, res) => {
  res.redirect('/health');
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

// =====================================================
// START SERVER
// =====================================================
const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`✅ SeekReap Tier-6 Backend running on port ${PORT}`);
  console.log(`📡 API endpoints available:`);
  console.log(`   - GET  /health`);
  console.log(`   - GET  /api/submissions`);
  console.log(`   - GET  /api/submissions/:job_id`);
  console.log(`   - POST /api/submit (forwards to Tier-5!)`);
  console.log(`   - POST /api/precheck`);
  console.log(`   - GET  /api/precheck/:id`);
  console.log(`   - GET  /api/creator/:id/prechecks`);
  console.log(`   - POST /api/appeals`);
  console.log(`   - GET  /api/appeals/:id`);
  console.log(`   - GET  /api/creator/:id/appeals`);
  console.log(`   - GET  /api/creator/:id/dashboard`);
  console.log(`   - GET  /api/policies`);
  console.log(`   - GET  /api/admin/appeals/pending`);
  console.log(`   - PATCH /api/admin/appeals/:id/status`);
  console.log(`🔄 Tier-5 URL: ${TIER5_URL}`);
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
      '/api/submit',
      '/api/precheck',
      '/api/appeals',
      '/api/policies',
      '/api/creator/:id/dashboard',
      '/api/admin/appeals/pending'
    ]
  });
});
