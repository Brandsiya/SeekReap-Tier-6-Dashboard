import React from 'react';

export default function JobCard({ job, onSelect }) {
  return (
    <div className={`job-card ${job.status}`} onClick={onSelect}>
      <h4>Job #{job.job_id} ({job.job_type})</h4>
      <p>Status: {job.status}</p>
      <p>Submitted: {new Date(job.created_at).toLocaleString()}</p>
    </div>
  );
}
