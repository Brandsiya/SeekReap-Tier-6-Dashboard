import React, { useEffect, useState } from 'react';
export default function SubmissionsDashboard() {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    async function fetchSubmissions() {
      try {
        const res = await fetch(`${process.env.REACT_APP_API_URL || "https://seekreap.onrender.com"}/api/submissions`);
        const data = await res.json();
        setSubmissions(data);
      } catch (err) {
        console.error("Error fetching submissions:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchSubmissions();
  }, []);
  if (loading) return <p>Loading submissions...</p>;
  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h2>Submissions Dashboard</h2>
      <table border="1" cellPadding="8" cellSpacing="0">
        <thead>
          <tr>
            <th>ID</th><th>Creator</th><th>Content</th><th>Type</th><th>Status</th>
            <th>Created</th><th>Started</th><th>Completed</th><th>Failure</th>
          </tr>
        </thead>
        <tbody>
          {submissions.map(s => (
            <tr key={s.job_id}>
              <td>{s.job_id}</td>
              <td>{s.creator_id}</td>
              <td>{s.content_id}</td>
              <td>{s.job_type}</td>
              <td>{s.status}</td>
              <td>{s.created_at}</td>
              <td>{s.started_at || '-'}</td>
              <td>{s.completed_at || '-'}</td>
              <td>{s.failure_reason || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
