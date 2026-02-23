import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

const POLL_INTERVAL = 3000;

export default function VerificationPage() {
  const { jobId } = useParams();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchJob = async () => {
      try {
        const res = await fetch(`http://localhost:5000/api/submissions/${jobId}`);
        const data = await res.json();
        setJob(data);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching job:', err);
      }
    };

    fetchJob();
    const interval = setInterval(fetchJob, POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [jobId]);

  if (loading) return <h2>Loading verification...</h2>;
  if (!job) return <h2>Job not found.</h2>;

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Verification Progress</h1>

      <p><strong>Job ID:</strong> {job.id}</p>
      <p><strong>Status:</strong> {job.status}</p>

      {job.status !== 'completed' && (
        <div>
          <h3>Processing...</h3>
          <div style={{
            width: '100%',
            background: '#eee',
            height: '20px',
            borderRadius: '5px'
          }}>
            <div style={{
              width: job.progress ? `${job.progress}%` : '30%',
              background: '#007bff',
              height: '100%',
              borderRadius: '5px'
            }} />
          </div>
        </div>
      )}

      {job.status === 'completed' && (
        <div style={{ marginTop: '2rem' }}>
          <h2>Risk Analysis</h2>
          <p><strong>Risk Score:</strong> {job.risk_score}</p>
          <p><strong>Risk Level:</strong> {job.risk_level}</p>

          <h2>Appeal Draft</h2>
          <pre>{job.appeal_text}</pre>
        </div>
      )}
    </div>
  );
}
