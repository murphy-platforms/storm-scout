/**
 * Storm Scout API Client
 * Handles all backend API requests
 */

const API_BASE_URL = 'http://localhost:3000/api';

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
    }
};
