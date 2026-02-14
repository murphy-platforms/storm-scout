/**
 * Storm Scout Utility Functions
 * Common helper functions for the frontend
 */

/**
 * Get Bootstrap badge class for severity
 */
function getSeverityBadge(severity) {
    const badges = {
        'Extreme': 'bg-danger',
        'Severe': 'bg-warning text-dark',
        'Moderate': 'bg-info text-dark',
        'Minor': 'bg-secondary',
        'Unknown': 'bg-light text-dark'
    };
    return badges[severity] || 'bg-light text-dark';
}

/**
 * Get Bootstrap badge class for operational status
 */
function getStatusBadge(status) {
    const badges = {
        'Closed': 'bg-danger',
        'At Risk': 'bg-warning text-dark',
        'Open': 'bg-success',
        'active': 'bg-success',
        'expired': 'bg-secondary',
        'cancelled': 'bg-secondary'
    };
    return badges[status] || 'bg-secondary';
}

/**
 * Format date string to readable format
 */
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (isNaN(date)) return dateString;
    
    // Format as: Jan 10, 2026 3:45 PM
    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
}

/**
 * Show error message (placeholder - enhance as needed)
 */
function showError(message) {
    console.error(message);
    // Could enhance this to show toast notifications
    alert(message);
}
