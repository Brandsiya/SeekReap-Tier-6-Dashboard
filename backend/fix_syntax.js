// CORRECTED VERSION - with proper catch block
app.get('/api/submissions/:job_id', async (req, res) => {
  try {
    const { job_id } = req.params;
    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('job_id', job_id)
      .single();
    
    if (error) throw error;
    if (!data) {
      return res.status(404).json({ error: 'Submission not found' });
    }
    res.json(data);
  } catch (error) {
    console.error('Error fetching submission:', error);
    res.status(500).json({ error: error.message });
  }
});
