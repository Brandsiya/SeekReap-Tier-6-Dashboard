import React from 'react';

export default function AuditTrail({ job }) {
  return (
    <div className="audit-trail">
      <h4>Job History</h4>
      <ul>
        <li>Created: {new Date(job.created_at).toLocaleString()}</li>
        {job.started_at && <li>Started: {new Date(job.started_at).toLocaleString()}</li>}
        {job.completed_at && <li>Completed: {new Date(job.completed_at).toLocaleString()}</li>}
        {job.failure_reason && <li>Failure: {job.failure_reason}</li>}
      </ul>
    </div>
  );
}
