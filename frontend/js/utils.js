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
 * 
 * @example
 * escapeHtml('<script>alert("xss")</script>')  
 * // Returns: '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
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
 * 
 * @example
 * // Safe: Static HTML you control
 * html`<div>${raw('<span class="badge">Status</span>')}</div>`
 * 
 * // DANGEROUS - Never do this:
 * html`<div>${raw(userInput)}</div>`  // XSS vulnerability!
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
 * 
 * @example
 * // Basic usage - values are automatically escaped
 * const userInput = '<script>alert("xss")</script>';
 * container.innerHTML = html`<div class="message">${userInput}</div>`;
 * // Result: <div class="message">&lt;script&gt;...&lt;/script&gt;</div>
 * 
 * @example
 * // With trusted HTML using raw()
 * const badge = '<span class="badge bg-success">Active</span>';
 * container.innerHTML = html`<div>${advisory.name} ${raw(badge)}</div>`;
 * 
 * @example
 * // Complex template with mixed content
 * container.innerHTML = html`
 *     <div class="card">
 *         <h3>${data.title}</h3>
 *         <p>${data.description}</p>
 *         ${raw(getSeverityBadge(data.severity))}
 *     </div>
 * `;
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

// =============================================================================
// DATA FORMATTING HELPERS
// =============================================================================

/**
 * Convert Celsius to Fahrenheit, rounded to nearest integer.
 * @param {number|null} tempC - Temperature in Celsius
 * @returns {number|null} Temperature in Fahrenheit, or null if input is null
 */
function cToF(tempC) {
    if (tempC == null) return null;
    return Math.round((parseFloat(tempC) * 9 / 5) + 32);
}

/**
 * Return a human-friendly relative time string (e.g. "5 min ago").
 * @param {string} dateString - ISO date string
 * @returns {string} Relative time description
 */
function timeAgo(dateString) {
    if (!dateString) return '';
    const now = Date.now();
    const then = new Date(dateString).getTime();
    const diffMin = Math.round((now - then) / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin} min ago`;
    const diffHrs = Math.round(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs} hr ago`;
    return `${Math.round(diffHrs / 24)} day ago`;
}

/**
 * Check if an observation timestamp is stale (older than 90 minutes).
 * @param {string} observedAt - ISO date string of observation
 * @returns {boolean} True if stale or missing
 */
function isStale(observedAt) {
    if (!observedAt) return true;
    return (Date.now() - new Date(observedAt).getTime()) > 90 * 60 * 1000;
}

/**
 * Truncate a string to a maximum length, appending ellipsis if truncated.
 * @param {string} str - String to truncate
 * @param {number} max - Maximum length
 * @returns {string} Truncated string
 */
function truncate(str, max) {
    if (!str) return '';
    return str.length > max ? str.substring(0, max) + '…' : str;
}

/**
 * Format an ISO timestamp in the user's local timezone.
 * @param {string} isoString - ISO date string
 * @returns {string} Formatted local date/time string
 */
function formatLocalTime(isoString) {
    if (!isoString) return 'Never';
    const date = new Date(isoString);
    return date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });
}
