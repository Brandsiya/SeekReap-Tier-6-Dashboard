require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

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
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/submit', async (req, res) => {
  const { creator_id, content_id, job_type, status } = req.body;
  try {
    await pool.query(
      `INSERT INTO job_queue (creator_id, content_id, job_type, status)
       SELECT $1, $2, $3, $4
       WHERE NOT EXISTS (
         SELECT 1 FROM job_queue
         WHERE creator_id = $1 AND content_id = $2 AND job_type = $3
       )`,
      [creator_id, content_id, job_type, status || 'pending']
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve React build
app.use(express.static(path.join(__dirname, 'public')));

// Fallback for React Router (Express 5 safe)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Dashboard backend running on port ${PORT}`));
