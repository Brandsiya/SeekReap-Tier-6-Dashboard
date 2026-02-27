import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function UploadPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    // Prevent default form submission
    e.preventDefault();
    
    // Prevent multiple submissions
    if (isSubmitting) return;
    
    // Validate input
    if (!file && !url) {
      setStatus('Please select a file or enter a YouTube URL');
      return;
    }

    setIsSubmitting(true);
    setStatus('Submitting...');

    try {
      const API_BASE = process.env.REACT_APP_API_URL || 'https://seekreap.onrender.com';
      let response;

      if (file) {
        // Handle file upload with FormData
        const formData = new FormData();
        formData.append('video', file);
        response = await fetch(`${API_BASE}/api/submit`, {
          method: 'POST',
          body: formData
        });
      } else {
        // Handle URL submission with JSON
        response = await fetch(`${API_BASE}/api/submit`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            creator_id: 1,
            url: url,
            job_type: 'url'
          })
        });
      }

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Submission failed');
      }

      // Navigate to verification page with the job ID
      navigate(`/verify/${data.job_id || data.id}`);
    } catch (err) {
      console.error('Upload error:', err);
      setStatus(`Error: ${err.message}. Please try again.`);
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Upload Video for Verification</h1>
      
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '2rem' }}>
          <h3>Option 1: Upload Video File</h3>
          <input
            type="file"
            accept="video/*"
            onChange={(e) => {
              setFile(e.target.files[0]);
              setUrl('');
            }}
            disabled={isSubmitting}
          />
          {file && <p>Selected: {file.name}</p>}
        </div>
        
        <div style={{ marginBottom: '2rem' }}>
          <h3>Option 2: YouTube URL</h3>
          <input
            type="url"
            placeholder="https://youtube.com/watch?v=..."
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setFile(null);
            }}
            disabled={isSubmitting}
            style={{ width: '100%', padding: '0.5rem', fontSize: '1rem' }}
          />
        </div>
        
        <button
          type="submit"
          disabled={isSubmitting || (!file && !url)}
          style={{
            padding: '0.75rem 1.5rem',
            background: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '1rem',
            cursor: (isSubmitting || (!file && !url)) ? 'not-allowed' : 'pointer',
            opacity: (isSubmitting || (!file && !url)) ? 0.6 : 1
          }}
        >
          {isSubmitting ? 'Submitting...' : 'Submit'}
        </button>
        
        {status && (
          <p style={{ 
            marginTop: '1rem', 
            padding: '0.5rem',
            background: status.includes('Error') ? '#ffebee' : '#e8f5e8',
            color: status.includes('Error') ? '#c62828' : '#2e7d32',
            borderRadius: '4px'
          }}>
            {status}
          </p>
        )}
      </form>
    </div>
  );
}
