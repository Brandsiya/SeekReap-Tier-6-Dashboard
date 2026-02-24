import React, { useState, useEffect } from 'react';
import axios from 'axios';

const POLL_INTERVAL_MS = 3000; // poll every 3 seconds

const CreatorUploadPage = () => {
  const [videoFile, setVideoFile] = useState(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [jobType, setJobType] = useState('pre_flag'); 
  const [jobStatus, setJobStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [jobResult, setJobResult] = useState(null);

  const handleFileChange = (e) => {
    setVideoFile(e.target.files[0]);
  };

  const pollJobStatus = async (jobId) => {
    try {
      const response = await axios.get(`/api/submissions/${jobId}`);
      setJobStatus(response.data);
      if (response.data.status === 'completed' || response.data.status === 'failed') {
        clearInterval(window.pollingInterval);
        setJobResult(response.data.result || null);
      }
    } catch (err) {
      console.error('Error polling job status:', err);
      clearInterval(window.pollingInterval);
      setError('Failed to fetch job status.');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setJobResult(null);
    setLoading(true);

    try {
      let formData = new FormData();
      formData.append('job_type', jobType);

      if (jobType === 'pre_flag' && videoFile) {
        formData.append('video_file', videoFile);
      } else if (jobType === 'appeal_prep' && youtubeUrl) {
        formData.append('youtube_url', youtubeUrl);
      } else {
        throw new Error('Please provide a valid file or URL.');
      }

      const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/submit`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setJobStatus({ job_id: response.data.job_id, status: response.data.status });
      window.pollingInterval = setInterval(() => pollJobStatus(response.data.job_id), POLL_INTERVAL_MS);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="creator-upload-page">
      <h2>Upload Video / Submit YouTube URL</h2>

      <form onSubmit={handleSubmit}>
        <div>
          <label>
            Job Type:
            <select value={jobType} onChange={(e) => setJobType(e.target.value)}>
              <option value="pre_flag">Pre-Flag Risk Analysis</option>
              <option value="appeal_prep">Appeal Defense Preparation</option>
            </select>
          </label>
        </div>

        {jobType === 'pre_flag' && (
          <div>
            <label>
              Upload Video File:
              <input type="file" accept="video/*" onChange={handleFileChange} />
            </label>
          </div>
        )}

        {jobType === 'appeal_prep' && (
          <div>
            <label>
              YouTube Video URL:
              <input
                type="url"
                placeholder="https://www.youtube.com/watch?v=..."
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                required
              />
            </label>
          </div>
        )}

        <button type="submit" disabled={loading}>
          {loading ? 'Submitting...' : 'Submit'}
        </button>
      </form>

      {jobStatus && (
        <div className="job-status">
          <p>Job ID: {jobStatus.job_id} | Status: {jobStatus.status}</p>
        </div>
      )}

      {jobResult && (
        <div className="job-result">
          <h3>Job Result</h3>
          <pre>{JSON.stringify(jobResult, null, 2)}</pre>
        </div>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  );
};

export default CreatorUploadPage;
