import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

const POLL_INTERVAL = 3000;

export default function VerificationPage() {
  const { jobId } = useParams();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchJob = async () => {
      try {
        // CRITICAL: Use environment variable with fallback
        const API_BASE = process.env.REACT_APP_API_URL || 'https://seekreap.onrender.com';
        
        // Make sure we're using the full URL
        const url = `${API_BASE}/api/submissions/${jobId}`;
        console.log('Fetching:', url); // This will help debug
        
        const res = await fetch(url);
        
        if (!res.ok) {
          throw new Error(`Failed to fetch job: ${res.status}`);
        }
        
        const data = await res.json();
        setJob(data);
        setLoading(false);
        setError(null);
      } catch (err) {
        console.error('Error fetching job:', err);
        setError(err.message);
        setLoading(false);
      }
    };

    fetchJob();
    const interval = setInterval(fetchJob, POLL_INTERVAL);
    
    return () => clearInterval(interval);
  }, [jobId]);

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>Loading verification results...</h2>
        <p>Your video is being analyzed. This may take a few moments.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>Error Loading Results</h2>
        <p style={{ color: 'red' }}>{error}</p>
        <button 
          onClick={() => window.location.reload()}
          style={{
            padding: '0.5rem 1rem',
            background: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!job) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>Job Not Found</h2>
        <p>The requested job could not be found.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Verification Results</h1>
      
      <div style={{ 
        background: '#f5f5f5', 
        padding: '1rem', 
        borderRadius: '8px',
        marginBottom: '1rem'
      }}>
        <h3>Job #{job.job_id}</h3>
        <p><strong>Status:</strong> {job.status}</p>
        <p><strong>Type:</strong> {job.job_type}</p>
        <p><strong>Created:</strong> {new Date(job.created_at).toLocaleString()}</p>
        
        {job.status === 'completed' && (
          <div>
            <h4>Results:</h4>
            <pre style={{ 
              background: '#e9ecef', 
              padding: '1rem', 
              borderRadius: '4px',
              overflow: 'auto'
            }}>
              {JSON.stringify(job.params, null, 2)}
            </pre>
          </div>
        )}
        
        {job.status === 'pending' && (
          <div>
            <h4>Job Pending</h4>
            <p>Your job is queued and will start processing soon.</p>
          </div>
        )}
        
        {job.status === 'failed' && (
          <div style={{ color: 'red' }}>
            <h4>Job Failed</h4>
            <p>Reason: {job.failure_reason || 'Unknown error'}</p>
          </div>
        )}
      </div>
      
      <button 
        onClick={() => window.location.href = '/'}
        style={{
          padding: '0.5rem 1rem',
          background: '#6c757d',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        Upload Another Video
      </button>
    </div>
  );
}
