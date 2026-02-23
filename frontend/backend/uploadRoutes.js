const express = require('express');
const multer = require('multer');
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() }); // keep in memory only

// Video file upload
router.post('/video', upload.single('video'), async (req, res) => {
  // Process the video (pre-flag ingestion)
  // Do NOT store the video, only extract metadata or pass to pre-flag engine
  const jobId = Math.floor(Math.random() * 10000); // placeholder job id
  res.json({ job_id: jobId });
});

// YouTube URL submission
router.post('/url', async (req, res) => {
  const { video_url } = req.body;
  // Validate and process the URL (appeal prep ingestion)
  const jobId = Math.floor(Math.random() * 10000); // placeholder job id
  res.json({ job_id: jobId });
});

module.exports = router;
