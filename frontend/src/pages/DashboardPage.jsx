import React, { useEffect, useState } from 'react';
import JobCard from '../components/JobCard';
import RiskAssessment from '../components/RiskAssessment';
import AppealGuidance from '../components/AppealGuidance';
import AuditTrail from '../components/AuditTrail';

export default function DashboardPage() {
  const [jobs, setJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);

  // Poll jobs every 5 seconds
  useEffect(() => {
    const fetchJobs = () => {
      fetch('/api/submissions')
        .then(res => res.json())
        .then(data => setJobs(data))
        .catch(console.error);
    };

    fetchJobs();
    const interval = setInterval(fetchJobs, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="dashboard">
      <h1>Creator Compliance Dashboard</h1>
      <div className="job-list">
        {jobs.map(job => (
          <JobCard key={job.job_id} job={job} onSelect={() => setSelectedJob(job)} />
        ))}
      </div>

      {selectedJob && (
        <div className="job-details">
          <RiskAssessment job={selectedJob} />
          <AppealGuidance job={selectedJob} />
          <AuditTrail job={selectedJob} />
        </div>
      )}
    </div>
  );
}
