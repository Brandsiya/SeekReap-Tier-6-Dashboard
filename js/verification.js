// Get job ID from URL
function getJobIdFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('jobId');
}

// Show error message
function showError(message) {
    document.getElementById('status-message').style.display = 'none';
    document.getElementById('error-container').style.display = 'block';
    document.getElementById('error-message').textContent = message;
    document.querySelector('.spinner').style.display = 'none';
}

// Show success message
function showSuccess(message) {
    document.getElementById('status-message').style.display = 'none';
    document.getElementById('success-container').style.display = 'block';
    document.getElementById('success-message').textContent = message;
    document.querySelector('.spinner').style.display = 'none';
    document.getElementById('progress-bar').style.width = '100%';
}

// Update UI based on job status
function updateStatusUI(job) {
    const statusEl = document.getElementById('status-message');
    const progressEl = document.getElementById('progress-bar');
    
    const statusMessages = {
        'queued': '📋 Job queued - waiting to start...',
        'pending': '⏳ Preparing to process...',
        'processing': '⚙️ Processing your video...',
        'completed': '✅ Complete! Redirecting...',
        'failed': '❌ Processing failed'
    };
    
    statusEl.textContent = statusMessages[job.status] || `Status: ${job.status}`;
    
    const progressMap = {
        'queued': 10,
        'pending': 25,
        'processing': 60,
        'completed': 100,
        'failed': 100
    };
    
    progressEl.style.width = (progressMap[job.status] || 0) + '%';
    document.getElementById('job-id-display').textContent = `Job ID: ${job.job_id}`;
}

// Poll for job status
let pollTimeout = null;

function pollStatus(jobId) {
    console.log('Polling for job:', jobId);
    
    fetch(`${CONFIG.API_BASE}/api/submissions`)
        .then(response => {
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.json();
        })
        .then(submissions => {
            const job = submissions.find(s => s.job_id.toString() === jobId.toString());
            
            if (!job) {
                document.getElementById('status-message').textContent = '⏳ Waiting for job to appear...';
                pollTimeout = setTimeout(() => pollStatus(jobId), CONFIG.POLL_INTERVAL);
                return;
            }
            
            console.log('Found job:', job);
            updateStatusUI(job);
            
            switch(job.status) {
                case 'completed':
                    showSuccess('Processing complete! Redirecting to results...');
                    setTimeout(() => {
                        window.location.href = `/results.html?jobId=${jobId}`;
                    }, 2000);
                    break;
                    
                case 'failed':
                    showError(job.failure_reason || 'Processing failed. Please try again.');
                    break;
                    
                default:
                    pollTimeout = setTimeout(() => pollStatus(jobId), CONFIG.POLL_INTERVAL);
                    break;
            }
        })
        .catch(error => {
            console.error('Error polling status:', error);
            document.getElementById('status-message').textContent = '⚠️ Connection error. Retrying...';
            pollTimeout = setTimeout(() => pollStatus(jobId), CONFIG.POLL_INTERVAL * 2);
        });
}

// Retry upload
function retryUpload() {
    window.location.href = '/upload.html';
}

// Cleanup
window.addEventListener('beforeunload', function() {
    if (pollTimeout) clearTimeout(pollTimeout);
});

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    const jobId = getJobIdFromUrl();
    
    if (jobId) {
        document.getElementById('job-id-display').textContent = `Job ID: ${jobId}`;
        pollStatus(jobId);
    } else {
        showError('No job ID provided. Please upload a video first.');
    }
});
