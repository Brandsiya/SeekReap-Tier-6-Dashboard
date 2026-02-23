import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function UploadPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState('');

  const submit = async () => {
    const formData = new FormData();
    if (file) formData.append('videoFile', file);
    if (url) formData.append('youtubeUrl', url);

    setStatus('Submitting...');

    try {
        const API_BASE = process.env.REACT_APP_API_URL;
        const res = await fetch(`${API_BASE}/api/submissions`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) throw new Error('Submission failed');

      navigate(`/verify/${data.id}`);
    } catch (err) {
      setStatus('Error submitting job.');
    }
  };

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Upload Video for Verification</h1>

      <div>
        <input
          type="file"
          accept="video/*"
          onChange={(e) => setFile(e.target.files[0])}
        />
      </div>

      <div>
        <input
          type="text"
          placeholder="YouTube URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </div>

      <button onClick={submit}>Submit</button>

      <p>{status}</p>
    </div>
  );
}

export default UploadPage;
