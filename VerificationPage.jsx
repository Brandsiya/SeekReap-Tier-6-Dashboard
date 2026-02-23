// frontend/src/pages/VerificationPage.jsx
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

const VerificationPage = () => {
  const { jobId } = useParams();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const API_BASE = process.env.REACT_APP_API_URL || "https://seekreap.onrender.com";

  useEffect(() => {
    const fetchJob = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/submissions/${jobId}`);
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.message || "Failed to fetch job.");
        }
        const data = await res.json();
        setJob(data);
      } catch (err) {
        console.error("Error fetching job:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchJob();
  }, [jobId, API_BASE]);

  if (loading) return <p>Loading job details...</p>;
  if (error) return <p>Error: {error}</p>;
  if (!job) return <p>No job found.</p>;

  return (
    <div>
      <h1>Job Verification</h1>
      <p><strong>Job ID:</strong> {job.job_id}</p>
      <p><strong>Creator ID:</strong> {job.creator_id}</p>
      <p><strong>Content ID:</strong> {job.content_id}</p>
      <p><strong>Job Type:</strong> {job.job_type}</p>
      <p><strong>Status:</strong> {job.status}</p>
      <p><strong>Created At:</strong> {new Date(job.created_at).toLocaleString()}</p>
      {job.started_at && <p><strong>Started At:</strong> {new Date(job.started_at).toLocaleString()}</p>}
      {job.completed_at && <p><strong>Completed At:</strong> {new Date(job.completed_at).toLocaleString()}</p>}
      {job.failure_reason && <p><strong>Failure Reason:</strong> {job.failure_reason}</p>}
    </div>
  );
};

export default VerificationPage;
