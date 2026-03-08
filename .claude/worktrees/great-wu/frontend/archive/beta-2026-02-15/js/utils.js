/**
 * Storm Scout Utility Functions
 * Common helper functions for the frontend
 */

// =============================================================================
// SECURE HTML TEMPLATE FUNCTIONS
// =============================================================================
// These functions provide XSS protection for dynamic HTML content.
// See docs/security/SECURE-TEMPLATES.md for usage guide.
// =============================================================================

/**
 * Escape HTML special characters to prevent XSS attacks.
 * Use this when inserting untrusted data into HTML.
 * 
 * @param {*} unsafe - The value to escape (will be converted to string)
 * @returns {string} HTML-escaped string safe for insertion
 */
function escapeHtml(unsafe) {
    if (unsafe == null) return '';
    return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Mark a string as trusted HTML that should NOT be escaped.
 * ONLY use this for HTML you have constructed yourself, never for user input.
 * 
 * @param {string} trustedHtml - HTML string that is known to be safe
 * @returns {Object} Object with __raw property containing the HTML
 */
function raw(trustedHtml) {
    return { __raw: trustedHtml };
}

/**
 * Tagged template literal for safe HTML generation.
 * Automatically escapes all interpolated values unless wrapped in raw().
 * 
 * @param {TemplateStringsArray} strings - The template literal strings
 * @param {...*} values - The interpolated values
 * @returns {string} Safe HTML string with escaped values
 */
function html(strings, ...values) {
    let result = strings[0];
    for (let i = 0; i < values.length; i++) {
        const value = values[i];
        // Check if value is marked as raw (trusted HTML)
        if (value && typeof value === 'object' && value.__raw !== undefined) {
            result += value.__raw;
        } else {
            result += escapeHtml(value);
        }
        result += strings[i + 1];
    }
    return result;
}

// =============================================================================
// UI HELPER FUNCTIONS
// =============================================================================

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
