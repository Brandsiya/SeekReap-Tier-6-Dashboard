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
        const API_BASE = process.env.REACT_APP_API_URL || 'https://seekreap.onrender.com';
        const res = await fetch(`${API_BASE}/api/submissions/${jobId}`);
        
        if (!res.ok) {
          throw new Error(`Failed to fetch job: ${res.status}`);
        }
        
        const data = await res.json();
        setJob(data);
        setLoading(false);
        
        // Stop polling if job is completed or failed
        if (data.status === 'completed' || data.status === 'failed' || data.status === 'archived') {
          return true; // Signal to stop polling
        }
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
      <div style={styles.container}>
        <h2>Loading verification results...</h2>
        <div style={styles.spinner}></div>
        <p>Your video is being analyzed. This may take a few moments.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <h2>Error Loading Results</h2>
        <div style={styles.errorBox}>
          <p>{error}</p>
        </div>
        <button 
          onClick={() => window.location.reload()} 
          style={styles.button}
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!job) {
    return (
      <div style={styles.container}>
        <h2>Job Not Found</h2>
        <p>The verification job you're looking for doesn't exist.</p>
        <button 
          onClick={() => window.location.href = '/upload'} 
          style={styles.button}
        >
          Upload New Video
        </button>
      </div>
    );
  }

  // Show appropriate content based on job status
  const renderContent = () => {
    switch(job.status) {
      case 'pending':
        return (
          <div style={styles.statusSection}>
            <h3>Job Pending</h3>
            <div style={styles.progressBar}>
              <div style={{...styles.progressFill, width: '10%'}}></div>
            </div>
            <p>Your job is queued and will start processing soon.</p>
          </div>
        );
      
      case 'processing':
      case 'in_progress':
        return (
          <div style={styles.statusSection}>
            <h3>Processing Your Video</h3>
            <div style={styles.progressBar}>
              <div style={{...styles.progressFill, width: job.progress ? `${job.progress}%` : '45%'}}></div>
            </div>
            <p>Analyzing content for compliance... This may take a minute.</p>
          </div>
        );
      
      case 'completed':
        return (
          <div style={styles.resultsSection}>
            <h2 style={styles.successTitle}>✅ Verification Complete</h2>
            
            {/* Risk Assessment */}
            {job.risk_assessment && (
              <div style={styles.card}>
                <h3>Risk Assessment</h3>
                <div style={styles.riskScore}>
                  <span style={styles.scoreLabel}>Overall Risk Score:</span>
                  <span style={{
                    ...styles.scoreValue,
                    color: job.risk_assessment.overall_risk_score < 35 ? '#4caf50' : 
                           job.risk_assessment.overall_risk_score < 70 ? '#ff9800' : '#f44336'
                  }}>
                    {job.risk_assessment.overall_risk_score}/100
                  </span>
                </div>
                
                {job.policy_matches && job.policy_matches.length > 0 && (
                  <div style={styles.section}>
                    <h4>Policy Matches</h4>
                    <ul style={styles.list}>
                      {job.policy_matches.map((match, i) => (
                        <li key={i} style={styles.listItem}>
                          <strong>Policy {match.policy_id}:</strong> {match.match_confidence}% confidence
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {job.recommended_actions && job.recommended_actions.length > 0 && (
                  <div style={styles.section}>
                    <h4>Recommended Actions</h4>
                    <ol style={styles.list}>
                      {job.recommended_actions.map((action, i) => (
                        <li key={i} style={styles.listItem}>{action}</li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            )}
            
            {/* Appeal Guidance */}
            {job.appeal_intelligence && (
              <div style={styles.card}>
                <h3>Appeal Guidance</h3>
                <div style={styles.scoreRow}>
                  <span>Likelihood of Success:</span>
                  <strong>{job.appeal_intelligence.likelihood_score}/100</strong>
                </div>
                <div style={styles.scoreRow}>
                  <span>Defense Strength:</span>
                  <strong>{job.appeal_intelligence.defense_strength}</strong>
                </div>
                <div style={styles.scoreRow}>
                  <span>Suggested Tone:</span>
                  <strong>{job.appeal_intelligence.tone_guidance}</strong>
                </div>
                
                {job.appeal_intelligence.mitigation_arguments && (
                  <div style={styles.section}>
                    <h4>Mitigation Arguments</h4>
                    {job.appeal_intelligence.mitigation_arguments.map((arg, i) => (
                      <div key={i} style={styles.argumentBox}>
                        <p><strong>{arg.argument_text}</strong></p>
                        {arg.supporting_evidence && (
                          <p style={styles.evidence}>
                            Evidence: {arg.supporting_evidence.join(', ')}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            {/* Audit Trail */}
            <div style={styles.auditTrail}>
              <h4>Job Details</h4>
              <p><strong>Job ID:</strong> {job.job_id}</p>
              <p><strong>Content:</strong> {job.content_id}</p>
              <p><strong>Submitted:</strong> {new Date(job.created_at).toLocaleString()}</p>
              {job.completed_at && (
                <p><strong>Completed:</strong> {new Date(job.completed_at).toLocaleString()}</p>
              )}
            </div>
            
            <button 
              onClick={() => window.location.href = '/dashboard'} 
              style={styles.button}
            >
              View All Jobs
            </button>
          </div>
        );
      
      case 'failed':
        return (
          <div style={styles.container}>
            <h2 style={styles.errorTitle}>❌ Verification Failed</h2>
            <div style={styles.errorBox}>
              <p><strong>Reason:</strong> {job.failure_reason || 'Unknown error'}</p>
            </div>
            <button 
              onClick={() => window.location.href = '/upload'} 
              style={styles.button}
            >
              Try Again
            </button>
          </div>
        );
      
      default:
        return (
          <div style={styles.container}>
            <h2>Job Status: {job.status}</h2>
            <pre>{JSON.stringify(job, null, 2)}</pre>
          </div>
        );
    }
  };

  return (
    <div style={styles.container}>
      <h1>Verification Results</h1>
      {renderContent()}
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '800px',
    margin: '0 auto',
    padding: '2rem',
    fontFamily: 'system-ui, -apple-system, sans-serif'
  },
  card: {
    background: '#f8f9fa',
    borderRadius: '8px',
    padding: '1.5rem',
    marginBottom: '1.5rem',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
  },
  resultsSection: {
    marginTop: '2rem'
  },
  successTitle: {
    color: '#4caf50',
    marginBottom: '1.5rem'
  },
  errorTitle: {
    color: '#f44336',
    marginBottom: '1.5rem'
  },
  riskScore: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem',
    background: 'white',
    borderRadius: '4px',
    marginBottom: '1rem'
  },
  scoreLabel: {
    fontWeight: 'bold'
  },
  scoreValue: {
    fontSize: '1.5rem',
    fontWeight: 'bold'
  },
  section: {
    marginTop: '1rem',
    padding: '1rem',
    background: 'white',
    borderRadius: '4px'
  },
  list: {
    margin: '0.5rem 0',
    paddingLeft: '1.5rem'
  },
  listItem: {
    margin: '0.5rem 0'
  },
  argumentBox: {
    background: '#f1f3f5',
    padding: '1rem',
    borderRadius: '4px',
    margin: '0.5rem 0'
  },
  evidence: {
    color: '#666',
    fontSize: '0.9rem',
    marginTop: '0.5rem'
  },
  auditTrail: {
    background: '#e9ecef',
    padding: '1rem',
    borderRadius: '4px',
    fontSize: '0.9rem',
    color: '#666'
  },
  statusSection: {
    textAlign: 'center',
    padding: '2rem',
    background: '#f8f9fa',
    borderRadius: '8px'
  },
  progressBar: {
    width: '100%',
    height: '20px',
    background: '#e9ecef',
    borderRadius: '10px',
    margin: '1rem 0',
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    background: '#4caf50',
    transition: 'width 0.3s ease'
  },
  spinner: {
    border: '4px solid #f3f3f3',
    borderTop: '4px solid #3498db',
    borderRadius: '50%',
    width: '40px',
    height: '40px',
    margin: '20px auto',
    animation: 'spin 1s linear infinite'
  },
  button: {
    background: '#007bff',
    color: 'white',
    border: 'none',
    padding: '0.75rem 1.5rem',
    borderRadius: '4px',
    fontSize: '1rem',
    cursor: 'pointer',
    marginTop: '1rem'
  },
  errorBox: {
    background: '#ffebee',
    color: '#c62828',
    padding: '1rem',
    borderRadius: '4px',
    margin: '1rem 0'
  },
  scoreRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '0.5rem 0',
    borderBottom: '1px solid #e9ecef'
  }
};

// Add keyframes for spinner animation
const style = document.createElement('style');
style.textContent = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;
document.head.appendChild(style);
