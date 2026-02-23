require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();

app.use(cors());
app.use(express.json());

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// Root route
app.get("/", (req, res) => {
  res.json({ message: "SeekReap Tier-6 Backend Running 🚀" });
});

// 🔹 Submit Job
app.post("/api/submit", async (req, res) => {
  try {
    const { videoUrl } = req.body;

    const result = await pool.query(
      "INSERT INTO submissions (video_url, status) VALUES ($1, $2) RETURNING *",
      [videoUrl, "pending"]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to submit job" });
  }
});

// 🔹 Get All Submissions
app.get("/api/submissions", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM submissions ORDER BY id DESC"
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch submissions" });
  }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Dashboard backend running on port ${PORT}`);
});
