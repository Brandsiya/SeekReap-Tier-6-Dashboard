document.addEventListener('DOMContentLoaded', function() {
    fetch(`${CONFIG.API_BASE}/api/submissions`)
        .then(response => response.json())
        .then(jobs => {
            updateStats(jobs);
            renderJobs(jobs);
        })
        .catch(error => {
            console.error('Error fetching jobs:', error);
            document.getElementById('jobs-table-body').innerHTML = 
                '<tr><td colspan="5" style="color: red;">Error loading jobs</td></tr>';
        });
});

function updateStats(jobs) {
    document.getElementById('total-jobs').textContent = jobs.length;
    document.getElementById('completed-jobs').textContent = 
        jobs.filter(j => j.status === 'completed').length;
    document.getElementById('processing-jobs').textContent = 
        jobs.filter(j => ['processing', 'queued', 'pending'].includes(j.status)).length;
    document.getElementById('failed-jobs').textContent = 
        jobs.filter(j => j.status === 'failed').length;
}

function renderJobs(jobs) {
    const tbody = document.getElementById('jobs-table-body');
    
    if (jobs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No jobs found</td></tr>';
        return;
    }
    
    tbody.innerHTML = jobs.slice(0, 20).map(job => {
        const statusClass = {
            'completed': 'status-completed',
            'processing': 'status-processing',
            'failed': 'status-failed',
            'pending': 'status-pending',
            'queued': 'status-pending'
        }[job.status] || 'status-pending';
        
        const date = new Date(job.created_at).toLocaleString();
        
        return `
            <tr>
                <td>${job.job_id}</td>
                <td>${job.content_id?.substring(0, 30)}...</td>
                <td><span class="status-badge ${statusClass}">${job.status}</span></td>
                <td>${date}</td>
                <td>
                    <a href="/verification.html?jobId=${job.job_id}" style="color: #3498db;">View</a>
                </td>
            </tr>
        `;
    }).join('');
}
