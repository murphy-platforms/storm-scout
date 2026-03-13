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
 * Get severity badge class for severity level.
 * Uses custom .severity-* classes (defined in style.css) so all badge
 * contexts — inline, large, grouped — render the same colours.
 */
function getSeverityBadge(severity) {
    const badges = {
        Extreme: 'severity-extreme',
        Severe: 'severity-severe',
        Moderate: 'severity-moderate',
        Minor: 'severity-minor',
        Unknown: 'bg-light text-dark'
    };
    return badges[severity] || 'bg-light text-dark';
}

/**
 * Get Bootstrap badge class for operational status
 */
function getStatusBadge(status) {
    const badges = {
        Closed: 'bg-danger',
        'At Risk': 'bg-warning text-dark',
        Open: 'bg-success',
        active: 'bg-success',
        expired: 'bg-secondary',
        cancelled: 'bg-secondary'
    };
    return badges[status] || 'bg-secondary';
}

/**
 * Shared VTEC action code config.
 * Uses custom action-badge-* CSS classes where defined; falls back to Bootstrap.
 */
const VTEC_ACTION_CONFIG = {
    NEW: {
        label: 'NEW',
        class: 'action-badge-new',
        icon: '<i class="bi bi-bell-fill"></i>',
        title: 'New alert issued'
    },
    CON: {
        label: 'CONTINUED',
        class: 'action-badge-continued',
        icon: '<i class="bi bi-arrow-repeat"></i>',
        title: 'Alert continuing'
    },
    EXT: {
        label: 'EXTENDED',
        class: 'action-badge-extended',
        icon: '<i class="bi bi-clock-history"></i>',
        title: 'Alert time extended'
    },
    EXA: {
        label: 'EXTENDED',
        class: 'action-badge-extended',
        icon: '<i class="bi bi-clock-history"></i>',
        title: 'Alert extended (A)'
    },
    EXB: {
        label: 'EXTENDED',
        class: 'action-badge-extended',
        icon: '<i class="bi bi-clock-history"></i>',
        title: 'Alert extended (B)'
    },
    UPG: {
        label: 'UPGRADED',
        class: 'bg-warning text-dark',
        icon: '<i class="bi bi-arrow-up-circle-fill"></i>',
        title: 'Alert upgraded'
    },
    EXP: {
        label: 'EXPIRED',
        class: 'bg-secondary',
        icon: '<i class="bi bi-hourglass-bottom"></i>',
        title: 'Alert expired'
    },
    CAN: {
        label: 'CANCELLED',
        class: 'bg-dark',
        icon: '<i class="bi bi-x-circle-fill"></i>',
        title: 'Alert cancelled'
    },
    COR: {
        label: 'CORRECTED',
        class: 'bg-warning text-dark',
        icon: '<i class="bi bi-pencil-fill"></i>',
        title: 'Correction issued'
    },
    ROU: { label: 'ROUTINE', class: 'bg-secondary', icon: '<i class="bi bi-clipboard"></i>', title: 'Routine update' }
};

/**
 * Return a VTEC action badge HTML string.
 * @param {string|null} action - VTEC action code (e.g. 'NEW', 'EXT')
 * @returns {string} HTML badge string
 */
function getActionBadge(action) {
    if (!action) {
        return '<span class="badge bg-secondary" title="No VTEC action code">-</span>';
    }
    const config = VTEC_ACTION_CONFIG[action] || {
        label: action,
        class: 'bg-secondary',
        icon: '',
        title: `Action: ${action}`
    };
    return `<span class="badge ${config.class}" title="${config.title}">${config.icon} ${config.label}</span>`;
}

/**
 * Return a VTEC action badge HTML string, with time-aware styling for NEW alerts.
 * Alerts marked NEW within the last 2 hours use the animated action-badge-new class.
 * @param {Object} advisory - Advisory object with vtec_action and last_updated fields
 * @returns {string} HTML badge string
 */
function getActionBadgeWithTime(advisory) {
    if (!advisory.vtec_action) {
        return '<span class="badge bg-secondary">-</span>';
    }
    const config = {
        ...(VTEC_ACTION_CONFIG[advisory.vtec_action] || {
            label: advisory.vtec_action,
            class: 'bg-secondary',
            icon: '',
            title: `Action: ${advisory.vtec_action}`
        })
    };
    if (advisory.vtec_action === 'NEW') {
        const hoursOld = (Date.now() - new Date(advisory.last_updated)) / 3600000;
        if (hoursOld >= 2) config.class = 'bg-success';
    }
    return `<span class="badge ${config.class}" title="${config.title}">${config.icon} ${config.label}</span>`;
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
 * Return a standard empty-state HTML string for block-level containers.
 * @param {string} icon     - Bootstrap Icon name without the 'bi-' prefix (e.g. 'cloud-sun')
 * @param {string} title    - Bold primary message
 * @param {string} [subtitle] - Optional secondary message
 * @returns {string} HTML string (wraps in col-12 for use inside a .row container)
 */
function renderEmptyHtml(icon, title, subtitle) {
    const sub = subtitle ? `<p class="mb-0 small mt-1">${escapeHtml(subtitle)}</p>` : '';
    return `<div class="col-12 text-center py-5 text-muted">
        <i class="bi bi-${icon} fs-1 d-block mb-2"></i>
        <strong>${escapeHtml(title)}</strong>${sub}
    </div>`;
}

/**
 * Return a standard Bootstrap error alert HTML string.
 * Use for injecting into a container element's innerHTML.
 * @param {string} message - User-facing error message
 * @returns {string} HTML string
 */
function renderErrorHtml(message) {
    return `<div class="col-12">
        <div class="alert alert-danger" role="alert">
            <i class="bi bi-exclamation-triangle-fill me-2"></i>${escapeHtml(message)}
        </div>
    </div>`;
}

/**
 * Show an error alert inside a named container element.
 * Falls back to the first .container/.container-fluid on the page.
 * @param {string} message - User-facing error message
 * @param {string} [containerId] - Optional element ID to inject into
 */
function showError(message, containerId) {
    console.error(message);
    const target = containerId
        ? document.getElementById(containerId)
        : document.querySelector('.container-fluid, .container');
    if (target) {
        const wrapper = document.createElement('div');
        wrapper.className = 'row mt-3';
        wrapper.innerHTML = renderErrorHtml(message);
        target.prepend(wrapper);
    }
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
    return Math.round((parseFloat(tempC) * 9) / 5 + 32);
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
    return Date.now() - new Date(observedAt).getTime() > 90 * 60 * 1000;
}

/**
 * Render temperature display HTML from an observation object.
 * Returns empty string if observation is null or has no temperature data.
 * @param {Object} observation - Observation with temperature_c, observed_at, station_id
 * @returns {string} HTML string for temperature display
 */
function renderTemperatureHTML(observation) {
    if (!observation || observation.temperature_c == null) return '';
    const tempF = cToF(observation.temperature_c);
    const tempC = Math.round(parseFloat(observation.temperature_c));
    const stale = isStale(observation.observed_at);
    if (stale) {
        return `<div class="temp-display"><span class="text-dark"><span aria-hidden="true">🌡️</span> ${tempF}°F / ${tempC}°C</span> <small class="text-danger ms-2"><strong>${escapeHtml(observation.station_id)} - OFFLINE</strong></small></div>`;
    }
    return `<div class="temp-display"><span class="text-dark"><span aria-hidden="true">🌡️</span> ${tempF}°F / ${tempC}°C</span> <small class="text-muted ms-2">${timeAgo(observation.observed_at)}</small></div>`;
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
 * Return a debounced version of fn that fires only after `wait` ms of inactivity. (closes #115)
 * @param {Function} fn - Function to debounce
 * @param {number} wait - Milliseconds to wait after last call before firing
 * @returns {Function} Debounced function
 */
function debounce(fn, wait) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), wait);
    };
}

/**
 * Show a non-intrusive Bootstrap Toast notification. (closes #118)
 * Creates and appends a toast container if one is not already present.
 * @param {string} message - Text to display in the toast
 * @param {'warning'|'info'|'danger'} [type='warning'] - Bootstrap contextual color
 */
function showToast(message, type = 'warning') {
    let container = document.getElementById('stormScoutToastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'stormScoutToastContainer';
        container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
        container.style.zIndex = 'var(--z-tooltip, 1100)';
        document.body.appendChild(container);
    }

    const id = 'toast-' + Date.now();
    const toast = document.createElement('div');
    toast.id = id;
    toast.className = `toast align-items-center text-bg-${type} border-0`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    toast.setAttribute('aria-atomic', 'true');
    toast.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">${escapeHtml(message)}</div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto"
                    data-bs-dismiss="toast" aria-label="Dismiss"></button>
        </div>`;
    container.appendChild(toast);

    // Bootstrap 5 Toast API
    const bsToast = new bootstrap.Toast(toast, { delay: 6000 });
    bsToast.show();
    toast.addEventListener('hidden.bs.toast', () => toast.remove());
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
