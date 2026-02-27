// Get single submission by ID - CORRECTED with pool
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
