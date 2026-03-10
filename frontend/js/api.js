/**
 * Storm Scout API Client
 * Handles all backend API requests
 */

const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? `${window.location.protocol}//${window.location.host}/api`
  : '/api';

let _versionCache = null;

const API = {
    /**
     * Get app version and release date
     * Cached after first fetch
     */
    async getVersion() {
        if (_versionCache) return _versionCache;
        try {
            const response = await fetch(`${API_BASE_URL}/version`);
            _versionCache = await response.json();
            return _versionCache;
        } catch (error) {
            console.error('Failed to fetch version:', error);
            return null;
        }
    },
    /**
     * Get dashboard overview data
     * Cached in localStorage for 5 minutes to reduce redundant fetches on
     * page load and tab switches. Hard-refresh (Ctrl+Shift+R) bypasses cache.
     * Max staleness: 5-min client TTL + 15-min ingestion interval = 20 min.
     */
    async getOverview() {
        const CACHE_KEY = 'cache:overview';
        const CACHE_TTL = 5 * 60 * 1000;
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            if (raw) {
                const { data, ts } = JSON.parse(raw);
                if (Date.now() - ts < CACHE_TTL) return data;
            }
        } catch (e) { /* localStorage unavailable — proceed to fetch */ }

        const response = await fetch(`${API_BASE_URL}/status/overview`);
        const json = await response.json();
        if (!json.success) throw new Error(json.error || 'Failed to fetch overview');

        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ data: json.data, ts: Date.now() }));
        } catch (e) { /* quota exceeded or private browsing — skip caching */ }

        return json.data;
    },

    /**
     * Get all active advisories
     * Cached in localStorage for 5 minutes to reduce redundant full-dataset
     * fetches on page load and tab switches.
     * Max staleness: 5-min client TTL + 15-min ingestion interval = 20 min.
     */
    async getActiveAdvisories() {
        const CACHE_KEY = 'cache:advisories';
        const CACHE_TTL = 5 * 60 * 1000;
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            if (raw) {
                const { data, ts } = JSON.parse(raw);
                if (Date.now() - ts < CACHE_TTL) return data;
            }
        } catch (e) { /* localStorage unavailable — proceed to fetch */ }

        const response = await fetch(`${API_BASE_URL}/advisories/active`);
        const json = await response.json();
        if (!json.success) throw new Error(json.error || 'Failed to fetch advisories');

        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ data: json.data, ts: Date.now() }));
        } catch (e) { /* quota exceeded or private browsing — skip caching */ }

        return json.data;
    },

    /**
     * Get impacted offices (Closed or At Risk)
     */
    async getImpactedOffices() {
        const response = await fetch(`${API_BASE_URL}/status/offices-impacted`);
        const json = await response.json();
        if (!json.success) throw new Error(json.error || 'Failed to fetch impacted offices');
        return json.data;
    },

    /**
     * Get all active government/local notices
     */
    async getActiveNotices() {
        const response = await fetch(`${API_BASE_URL}/notices/active`);
        const json = await response.json();
        if (!json.success) throw new Error(json.error || 'Failed to fetch notices');
        return json.data;
    },

    /**
     * Get all current weather observations
     * Cached in localStorage for 5 minutes — observation data refreshes on
     * the same ingestion cycle as advisories.
     */
    async getObservations() {
        const CACHE_KEY = 'cache:observations';
        const CACHE_TTL = 5 * 60 * 1000;
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            if (raw) {
                const { data, ts } = JSON.parse(raw);
                if (Date.now() - ts < CACHE_TTL) return data;
            }
        } catch (e) { /* localStorage unavailable — proceed to fetch */ }

        const response = await fetch(`${API_BASE_URL}/observations`);
        const json = await response.json();
        if (!json.success) throw new Error(json.error || 'Failed to fetch observations');

        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ data: json.data, ts: Date.now() }));
        } catch (e) { /* quota exceeded or private browsing — skip caching */ }

        return json.data;
    },

    /**
     * Get all offices
     */
    async getOffices() {
        const response = await fetch(`${API_BASE_URL}/offices`);
        const json = await response.json();
        if (!json.success) throw new Error(json.error || 'Failed to fetch offices');
        return json.data;
    },

    /**
     * Get trends for all offices (Phase 3)
     */
    async getTrends(days = 7) {
        const response = await fetch(`${API_BASE_URL}/trends?days=${days}`);
        return await response.json();
    },

    /**
     * Get trend for a specific office (Phase 3)
     */
    async getOfficeTrend(officeId, days = 7) {
        const response = await fetch(`${API_BASE_URL}/trends/${officeId}?days=${days}`);
        return await response.json();
    },

    /**
     * Get full history for an office (Phase 3)
     */
    async getOfficeHistory(officeId, days = 7) {
        const response = await fetch(`${API_BASE_URL}/trends/${officeId}/history?days=${days}`);
        return await response.json();
    },

    // ========================================
    // HISTORICAL DATA API (MED-5)
    // ========================================

    /**
     * Get system-wide overview trends
     * @param {number} days - Number of days of history (default 3)
     * @returns {Promise} Trend data with severity counts, sites impacted, etc.
     */
    async getOverviewTrends(days = 3) {
        try {
            const response = await fetch(`${API_BASE_URL}/history/overview-trends?days=${days}`);
            return await response.json();
        } catch (error) {
            console.error('Failed to fetch overview trends:', error);
            return { status: 'error', message: error.message };
        }
    },

    /**
     * Get severity-specific trends for sparklines
     * @param {number} days - Number of days of history (default 3)
     * @returns {Promise} Severity trend data (critical, high, moderate, low)
     */
    async getSeverityTrends(days = 3) {
        try {
            const response = await fetch(`${API_BASE_URL}/history/severity-trends?days=${days}`);
            return await response.json();
        } catch (error) {
            console.error('Failed to fetch severity trends:', error);
            return { status: 'error', message: error.message };
        }
    },

    /**
     * Get per-office advisory count trends
     * @param {number} officeId - Office ID
     * @param {number} days - Number of days of history (default 3)
     * @returns {Promise} Office-specific trend data
     */
    async getOfficeTrends(officeId, days = 3) {
        try {
            const response = await fetch(`${API_BASE_URL}/history/office-trends/${officeId}?days=${days}`);
            return await response.json();
        } catch (error) {
            console.error(`Failed to fetch office trends for office ${officeId}:`, error);
            return { status: 'error', message: error.message };
        }
    },

    /**
     * Check if historical data is available and ready
     * @returns {Promise} Data availability status
     */
    async getHistoricalDataAvailability() {
        try {
            const response = await fetch(`${API_BASE_URL}/history/data-availability`);
            return await response.json();
        } catch (error) {
            console.error('Failed to check historical data availability:', error);
            return { 
                status: 'error', 
                message: 'Unable to check data availability',
                recommendation: 'Show "Accumulating data..." message'
            };
        }
    }
};
