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
    // Determine destination based on upload type
    if (req.path.includes('/evidence')) {
      cb(null, evidenceDir);
    } else {
      cb(null, uploadDir);
    }
  },
  filename: function (req, file, cb) {
    // Create unique filename with timestamp
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
    console.error('Database connection error:', err);
  } else {
    console.log('✅ Database connected successfully');
  }
});

// =====================================================
// EXISTING ENDPOINTS (Preserved)
// =====================================================

// Get all submissions (existing)
app.get('/api/submissions', async (req, res) => {

// Get single submission by ID
  try {
    const { submissionId } = req.params;

    // Get submission details
    const submission = await pool.query(
      `SELECT * FROM content_submissions WHERE submission_id = $1`,
      [submissionId]
    );

    if (submission.rows.length === 0) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    // Get all policy checks for this submission
    const policyChecks = await pool.query(
      `SELECT * FROM policy_checks WHERE submission_id = $1`,
      [submissionId]
    );

    // Get flagged segments for each policy check
    const checksWithSegments = await Promise.all(
      policyChecks.rows.map(async (check) => {
        const segments = await pool.query(
          `SELECT * FROM flagged_segments WHERE check_id = $1`,
          [check.check_id]
        );
        return {
          ...check,
          flagged_segments: segments.rows
        };
      })
    );

    // Get submission results if available
    const results = await pool.query(
      `SELECT * FROM submission_results WHERE submission_id = $1`,
      [submissionId]
    );

    res.json({
      submission: submission.rows[0],
      policy_checks: checksWithSegments,
      results: results.rows[0] || null
    });

  } catch (err) {
    console.error('Error fetching precheck results:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3. Get all pre-flag submissions for a creator
app.get('/api/creator/:creatorId/prechecks', async (req, res) => {
  try {
    const { creatorId } = req.params;

    // Get creator UUID from legacy ID
    const creator = await pool.query(
      'SELECT creator_id FROM creators WHERE legacy_creator_id = $1',
      [creatorId]
    );

    if (creator.rows.length === 0) {
      return res.json([]);
    }

    const submissions = await pool.query(
      `SELECT cs.*, 
        COUNT(pc.check_id) as policy_check_count,
        sr.overall_risk
       FROM content_submissions cs
       LEFT JOIN policy_checks pc ON cs.submission_id = pc.submission_id
       LEFT JOIN submission_results sr ON cs.submission_id = sr.submission_id
       WHERE cs.creator_id = $1
       GROUP BY cs.submission_id, sr.overall_risk
       ORDER BY cs.submitted_at DESC`,
      [creator.rows[0].creator_id]
    );

    res.json(submissions.rows);

  } catch (err) {
    console.error('Error fetching creator prechecks:', err);
    res.status(500).json({ error: err.message });
  }
});

// =====================================================
// NEW APPEAL ENDPOINTS
// =====================================================

// 4. Submit an appeal for an enforcement action
app.post('/api/appeals', async (req, res) => {
  try {
    console.log('📝 Appeal submission received');
    
    const {
      creator_id,
      youtube_video_id,
      video_title,
      action_type,
      policy_violated,
      youtube_notified_at,
      youtube_decision_url,
      raw_yt_notice,
      appeal_channel,
      grounds,
      creator_statement
    } = req.body;

    // Get or create creator
    let creatorUuid;
    const creatorResult = await pool.query(
      'SELECT creator_id FROM creators WHERE legacy_creator_id = $1',
      [creator_id || 1]
    );

    if (creatorResult.rows.length === 0) {
      const newCreator = await pool.query(
        `INSERT INTO creators (legacy_creator_id, joined_at)
         VALUES ($1, NOW())
         RETURNING creator_id`,
        [creator_id || 1]
      );
      creatorUuid = newCreator.rows[0].creator_id;
    } else {
      creatorUuid = creatorResult.rows[0].creator_id;
    }

    // Check appeal credits
    const creditsCheck = await pool.query(
      'SELECT appeal_credits FROM creators WHERE creator_id = $1',
      [creatorUuid]
    );

    if (creditsCheck.rows[0].appeal_credits <= 0) {
      return res.status(403).json({ 
        error: 'No appeal credits remaining',
        message: 'You have used all your appeal credits for this policy period'
      });
    }

    // Create enforcement action
    const enforcementResult = await pool.query(
      `INSERT INTO enforcement_actions (
        creator_id, youtube_video_id, video_title, action_type,
        policy_violated, youtube_notified_at, youtube_decision_url,
        raw_yt_notice, recorded_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING *`,
      [
        creatorUuid,
        youtube_video_id,
        video_title,
        action_type,
        policy_violated,
        youtube_notified_at ? new Date(youtube_notified_at) : null,
        youtube_decision_url,
        raw_yt_notice
      ]
    );

    // Create appeal
    const appealResult = await pool.query(
      `INSERT INTO appeals (
        action_id, creator_id, appeal_channel, grounds,
        creator_statement, status, submitted_at
      ) VALUES ($1, $2, $3, $4, $5, 'submitted', NOW())
      RETURNING *`,
      [
        enforcementResult.rows[0].action_id,
        creatorUuid,
        appeal_channel || 'youtube_studio',
        grounds || 'misclassification',
        creator_statement
      ]
    );

    // Record status change in history
    await pool.query(
      `INSERT INTO appeal_status_history (
        appeal_id, old_status, new_status, changed_by, note
      ) VALUES ($1, 'draft', 'submitted', 'creator', 'Initial submission')`,
      [appealResult.rows[0].appeal_id]
    );

    // Decrement appeal credits
    await pool.query(
      'UPDATE creators SET appeal_credits = appeal_credits - 1 WHERE creator_id = $1',
      [creatorUuid]
    );

    res.json({
      success: true,
      appeal: appealResult.rows[0],
      enforcement_action: enforcementResult.rows[0],
      remaining_credits: creditsCheck.rows[0].appeal_credits - 1,
      message: 'Appeal submitted successfully'
    });

  } catch (err) {
    console.error('Error in /api/appeals:', err);
    res.status(500).json({ error: err.message });
  }
});

// 5. Upload evidence for an appeal
app.post('/api/appeals/:appealId/evidence', upload.single('evidence'), async (req, res) => {
  try {
    const { appealId } = req.params;
    const { evidence_type, description } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'No evidence file provided' });
    }

    // Check if appeal exists
    const appealCheck = await pool.query(
      'SELECT appeal_id FROM appeals WHERE appeal_id = $1',
      [appealId]
    );

    if (appealCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Appeal not found' });
    }

    // Store evidence
    const evidenceResult = await pool.query(
      `INSERT INTO appeal_evidence (
        appeal_id, evidence_type, file_ref, description, added_at
      ) VALUES ($1, $2, $3, $4, NOW())
      RETURNING *`,
      [
        appealId,
        evidence_type || 'other',
        `/uploads/evidence/${req.file.filename}`,
        description || null
      ]
    );

    res.json({
      success: true,
      evidence: evidenceResult.rows[0]
    });

  } catch (err) {
    console.error('Error uploading evidence:', err);
    res.status(500).json({ error: err.message });
  }
});

// 6. Get appeal details
app.get('/api/appeals/:appealId', async (req, res) => {
  try {
    const { appealId } = req.params;

    // Get appeal with enforcement action
    const appeal = await pool.query(
      `SELECT a.*, ea.*, c.legacy_creator_id, c.channel_name
       FROM appeals a
       JOIN enforcement_actions ea ON a.action_id = ea.action_id
       JOIN creators c ON a.creator_id = c.creator_id
       WHERE a.appeal_id = $1`,
      [appealId]
    );

    if (appeal.rows.length === 0) {
      return res.status(404).json({ error: 'Appeal not found' });
    }

    // Get evidence
    const evidence = await pool.query(
      'SELECT * FROM appeal_evidence WHERE appeal_id = $1 ORDER BY added_at DESC',
      [appealId]
    );

    // Get status history
    const history = await pool.query(
      'SELECT * FROM appeal_status_history WHERE appeal_id = $1 ORDER BY changed_at DESC',
      [appealId]
    );

    // Get outcome if available
    const outcome = await pool.query(
      'SELECT * FROM appeal_outcomes WHERE appeal_id = $1',
      [appealId]
    );

    res.json({
      appeal: appeal.rows[0],
      evidence: evidence.rows,
      history: history.rows,
      outcome: outcome.rows[0] || null
    });

  } catch (err) {
    console.error('Error fetching appeal:', err);
    res.status(500).json({ error: err.message });
  }
});

// 7. Get all appeals for a creator
app.get('/api/creator/:creatorId/appeals', async (req, res) => {
  try {
    const { creatorId } = req.params;

    // Get creator UUID from legacy ID
    const creator = await pool.query(
      'SELECT creator_id FROM creators WHERE legacy_creator_id = $1',
      [creatorId]
    );

    if (creator.rows.length === 0) {
      return res.json([]);
    }

    const appeals = await pool.query(
      `SELECT a.*, ea.youtube_video_id, ea.video_title, ea.action_type,
              ao.outcome, ao.monetization_restored
       FROM appeals a
       JOIN enforcement_actions ea ON a.action_id = ea.action_id
       LEFT JOIN appeal_outcomes ao ON a.appeal_id = ao.appeal_id
       WHERE a.creator_id = $1
       ORDER BY a.submitted_at DESC`,
      [creator.rows[0].creator_id]
    );

    res.json(appeals.rows);

  } catch (err) {
    console.error('Error fetching creator appeals:', err);
    res.status(500).json({ error: err.message });
  }
});

// 8. Creator dashboard stats
app.get('/api/creator/:creatorId/dashboard', async (req, res) => {
  try {
    const { creatorId } = req.params;

    // Use the view we created
    const dashboard = await pool.query(
      `SELECT * FROM creator_dashboard WHERE legacy_creator_id = $1`,
      [creatorId]
    );

    if (dashboard.rows.length === 0) {
      // Return empty stats for new creators
      return res.json({
        total_prechecks: 0,
        total_enforcements: 0,
        total_appeals: 0,
        successful_appeals: 0,
        appeal_credits: 3
      });
    }

    // Get current appeal credits
    const credits = await pool.query(
      'SELECT appeal_credits FROM creators WHERE legacy_creator_id = $1',
      [creatorId]
    );

    res.json({
      ...dashboard.rows[0],
      appeal_credits: credits.rows[0]?.appeal_credits || 3
    });

  } catch (err) {
    console.error('Error fetching dashboard:', err);
    res.status(500).json({ error: err.message });
  }
});

// 9. Get policy categories and stats
app.get('/api/policies', async (req, res) => {
  try {
    const policies = await pool.query('SELECT * FROM policy_summary');
    res.json(policies.rows);
  } catch (err) {
    console.error('Error fetching policies:', err);
    res.status(500).json({ error: err.message });
  }
});

// =====================================================
// ADMIN/MODERATION ENDPOINTS
// =====================================================

// 10. Get pending appeals for moderation
app.get('/api/admin/appeals/pending', async (req, res) => {
  try {
    const pending = await pool.query(
      `SELECT a.*, ea.youtube_video_id, ea.video_title, ea.action_type,
              c.legacy_creator_id, c.channel_name,
              COUNT(e.evidence_id) as evidence_count
       FROM appeals a
       JOIN enforcement_actions ea ON a.action_id = ea.action_id
       JOIN creators c ON a.creator_id = c.creator_id
       LEFT JOIN appeal_evidence e ON a.appeal_id = e.appeal_id
       WHERE a.status = 'submitted' OR a.status = 'under_review'
       GROUP BY a.appeal_id, ea.youtube_video_id, ea.video_title, 
                ea.action_type, c.legacy_creator_id, c.channel_name
       ORDER BY a.submitted_at ASC`,
      []
    );

    res.json(pending.rows);

  } catch (err) {
    console.error('Error fetching pending appeals:', err);
    res.status(500).json({ error: err.message });
  }
});

// 11. Update appeal status (for moderators)
app.patch('/api/admin/appeals/:appealId/status', async (req, res) => {
  try {
    const { appealId } = req.params;
    const { status, note, outcome_data } = req.body;

    // Get current status
    const current = await pool.query(
      'SELECT status FROM appeals WHERE appeal_id = $1',
      [appealId]
    );

    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Appeal not found' });
    }

    // Update appeal status
    const updateResult = await pool.query(
      'UPDATE appeals SET status = $1 WHERE appeal_id = $2 RETURNING *',
      [status, appealId]
    );

    // Record in history
    await pool.query(
      `INSERT INTO appeal_status_history (
        appeal_id, old_status, new_status, changed_by, note
      ) VALUES ($1, $2, $3, 'moderator', $4)`,
      [appealId, current.rows[0].status, status, note || null]
    );

    // If appeal is upheld/denied, record outcome
    if (outcome_data && (status === 'upheld' || status === 'overturned' || status === 'denied')) {
      await pool.query(
        `INSERT INTO appeal_outcomes (
          appeal_id, outcome, monetization_restored, 
          distribution_restored, yt_response_text, responded_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())`,
        [
          appealId,
          outcome_data.outcome,
          outcome_data.monetization_restored || false,
          outcome_data.distribution_restored || false,
          outcome_data.yt_response_text || null
        ]
      );
    }

    res.json({
      success: true,
      appeal: updateResult.rows[0]
    });

  } catch (err) {
    console.error('Error updating appeal status:', err);
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
    endpoints: [
      '/api/submissions',
      '/api/submit',
      '/api/precheck',
      '/api/precheck/:id',
      '/api/creator/:id/prechecks',
      '/api/appeals',
      '/api/appeals/:id',
      '/api/appeals/:id/evidence',
      '/api/creator/:id/appeals',
      '/api/creator/:id/dashboard',
      '/api/policies',
      '/api/admin/appeals/pending',
      '/api/admin/appeals/:id/status'
    ]
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: "SeekReap Tier-6 Backend Running 🚀",
    version: "2.0.0",
    features: [
      "Job Processing",
      "Pre-flag Content Checking",
      "Demonetization Appeals",
      "Creator Dashboard",
      "Moderation Queue"
    ]
  });
});

// Serve uploaded files (optional)
app.use('/uploads', express.static('uploads'));

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`✅ SeekReap Tier-6 Backend running on port ${PORT}`);
  console.log(`📡 API endpoints available:`);
  console.log(`   - GET  /health`);
  console.log(`   - GET  /api/submissions`);
  console.log(`   - POST /api/submit`);
  console.log(`   - POST /api/precheck (NEW)`);
  console.log(`   - GET  /api/precheck/:id (NEW)`);
  console.log(`   - GET  /api/creator/:id/prechecks (NEW)`);
  console.log(`   - POST /api/appeals (NEW)`);
  console.log(`   - POST /api/appeals/:id/evidence (NEW)`);
  console.log(`   - GET  /api/appeals/:id (NEW)`);
  console.log(`   - GET  /api/creator/:id/appeals (NEW)`);
  console.log(`   - GET  /api/creator/:id/dashboard (NEW)`);
  console.log(`   - GET  /api/policies (NEW)`);
  console.log(`   - GET  /api/admin/appeals/pending (NEW)`);
  console.log(`   - PATCH /api/admin/appeals/:id/status (NEW)`);
});

// =====================================================
// ADDITIONAL HEALTH ENDPOINTS FOR ROBUSTNESS
// =====================================================

// Multiple health endpoint variations
app.get('/health', (req, res) => {
  console.log('✅ Health endpoint accessed at /health');
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    endpoints: [
      '/api/submissions',
      '/api/submit',
      '/api/precheck',
      '/api/precheck/:id',
      '/api/creator/:id/prechecks',
      '/api/appeals',
      '/api/appeals/:id',
      '/api/appeals/:id/evidence',
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
  console.log('✅ Health endpoint accessed at /api/health');
  res.redirect('/health');
});

// Catch-all for debugging - log any 404s
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
      '/api/submit',
      '/api/precheck',
      '/api/appeals',
      '/api/policies',
      '/api/creator/:id/dashboard',
      '/api/admin/appeals/pending'
    ]
  });
});
