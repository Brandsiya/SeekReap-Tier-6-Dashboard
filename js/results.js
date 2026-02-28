document.addEventListener('DOMContentLoaded', function() {
    const urlParams = new URLSearchParams(window.location.search);
    const jobId = urlParams.get('jobId');
    
    if (jobId) {
        const videoUrl = `${CONFIG.API_BASE}/api/results/${jobId}`;
        document.getElementById('processed-video').src = videoUrl;
        document.getElementById('download-btn').href = videoUrl;
    } else {
        document.body.innerHTML += '<p style="color:red; text-align:center;">No job ID provided</p>';
    }
});
