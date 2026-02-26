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
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
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

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// API routes
app.get('/api/submissions', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM job_queue ORDER BY job_id DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching submissions:', err);
    res.status(500).json({ error: err.message });
  }
});

// Updated submit endpoint - handles both file uploads and URL submissions
app.post('/api/submit', upload.single('video'), async (req, res) => {
  try {
    console.log('Received submission request');
    console.log('Body:', req.body);
    console.log('File:', req.file);

    let creator_id = req.body.creator_id || 1; // Default to 1 if not provided
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
    } 
    // Handle URL submission
    else if (req.body.url || req.body.youtubeUrl) {
      const url = req.body.url || req.body.youtubeUrl;
      content_id = `url-${Date.now()}`;
      params = { url };
      job_type = 'url';
    } 
    // Handle JSON submission (from your original code)
    else if (req.body.content_id) {
      content_id = req.body.content_id;
      job_type = req.body.job_type || 'video';
      params = req.body.params || {};
    } 
    else {
      return res.status(400).json({ 
        error: 'No file, URL, or content_id provided' 
      });
    }

    // Insert into database
    const result = await pool.query(
      `INSERT INTO job_queue (creator_id, content_id, job_type, status, params, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING *`,
      [creator_id, content_id, job_type, 'pending', params]
    );

    console.log('Job created:', result.rows[0]);
    res.json({ 
      success: true, 
      job_id: result.rows[0].job_id,
      id: result.rows[0].job_id  // Add this for frontend compatibility
    });

  } catch (err) {
    console.error('Error in /api/submit:', err);
    res.status(500).json({ 
      error: err.message,
      details: 'Failed to create job'
    });
  }
});

// Simple root route for backend health check
app.get('/', (req, res) => {
  res.json({ message: "SeekReap Tier-6 Backend Running 🚀" });
});

// Serve uploaded files (optional)
app.use('/uploads', express.static('uploads'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Dashboard backend running on port ${PORT}`));
