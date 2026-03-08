/**
 * Storm Scout API Client
 * Handles all backend API requests
 */

const API_BASE_URL = 'https://your-domain.example.com/api';

const API = {
    /**
     * Get dashboard overview data
     */
    async getOverview() {
        const response = await fetch(`${API_BASE_URL}/status/overview`);
        const json = await response.json();
        if (!json.success) throw new Error(json.error || 'Failed to fetch overview');
        return json.data;
    },

    /**
     * Get all active advisories
     */
    async getActiveAdvisories() {
        const response = await fetch(`${API_BASE_URL}/advisories/active`);
        const json = await response.json();
        if (!json.success) throw new Error(json.error || 'Failed to fetch advisories');
        return json.data;
    },

    /**
     * Get impacted sites (Closed or At Risk)
     */
    async getImpactedSites() {
        const response = await fetch(`${API_BASE_URL}/status/sites-impacted`);
        const json = await response.json();
        if (!json.success) throw new Error(json.error || 'Failed to fetch impacted sites');
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
     * Get all sites
     */
    async getSites() {
        const response = await fetch(`${API_BASE_URL}/sites`);
        const json = await response.json();
        if (!json.success) throw new Error(json.error || 'Failed to fetch sites');
        return json.data;
    },

    /**
     * Get trends for all sites (Phase 3)
     */
    async getTrends(days = 7) {
        const response = await fetch(`${API_BASE_URL}/trends?days=${days}`);
        return await response.json();
    },

    /**
     * Get trend for a specific site (Phase 3)
     */
    async getSiteTrend(siteId, days = 7) {
        const response = await fetch(`${API_BASE_URL}/trends/${siteId}?days=${days}`);
        return await response.json();
    },

    /**
     * Get full history for a site (Phase 3)
     */
    async getSiteHistory(siteId, days = 7) {
        const response = await fetch(`${API_BASE_URL}/trends/${siteId}/history?days=${days}`);
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
     * Get per-site advisory count trends
     * @param {number} siteId - Site ID
     * @param {number} days - Number of days of history (default 3)
     * @returns {Promise} Site-specific trend data
     */
    async getSiteTrends(siteId, days = 3) {
        try {
            const response = await fetch(`${API_BASE_URL}/history/site-trends/${siteId}?days=${days}`);
            return await response.json();
        } catch (error) {
            console.error(`Failed to fetch site trends for site ${siteId}:`, error);
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
