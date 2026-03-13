/**
 * Notice Model — MySQL/MariaDB
 *
 * Data access layer for the `notices` table. Notices are government or
 * operational announcements (e.g. federal emergency declarations, local
 * closures) that are not sourced from NOAA but are relevant to office location
 * operations. They are manually entered and have explicit effective/expiration
 * timestamps.
 *
 * Notices differ from NOAA advisories in that they are not ingested
 * automatically — they are created and managed by administrators via the API.
 *
 * @module NoticeModel
 */

const { getDatabase } = require('../config/database');

const NoticeModel = {
    /**
     * Retrieve all notices, optionally filtered by jurisdiction type, notice type,
     * or state. Returns all notices regardless of effective/expiration dates —
     * use getActive() for currently active notices only.
     *
     * @param {Object}  [filters={}]                   - Optional filter criteria
     * @param {string}  [filters.jurisdiction_type]    - e.g. 'Federal', 'State', 'Local'
     * @param {string}  [filters.notice_type]          - e.g. 'Emergency Declaration'
     * @param {string}  [filters.state]                - Two-letter state abbreviation
     * @returns {Promise<Array<Object>>} Array of notice rows ordered by effective_time DESC;
     *   empty array on error
     */
    async getAll(filters = {}) {
        const db = getDatabase();
        let query = 'SELECT * FROM notices WHERE 1=1';
        const params = [];

        if (filters.jurisdiction_type) {
            query += ' AND jurisdiction_type = ?';
            params.push(filters.jurisdiction_type);
        }

        if (filters.notice_type) {
            query += ' AND notice_type = ?';
            params.push(filters.notice_type);
        }

        if (filters.state) {
            query += ' AND jurisdiction = ?';
            params.push(filters.state);
        }

        query += ' ORDER BY effective_time DESC';

        try {
            const [rows] = await db.query(query, params);
            return rows;
        } catch (error) {
            console.error('Error fetching notices:', error);
            return [];
        }
    },

    /**
     * Retrieve currently active notices — those whose effective_time has passed and
     * whose expiration_time is either null (no expiry) or in the future.
     * Accepts the same filter options as getAll().
     *
     * @param {Object}  [filters={}]                - Optional filter criteria
     * @param {string}  [filters.jurisdiction_type] - e.g. 'Federal', 'State', 'Local'
     * @param {string}  [filters.state]             - Two-letter state abbreviation
     * @returns {Promise<Array<Object>>} Active notice rows ordered by effective_time DESC;
     *   empty array on error
     */
    async getActive(filters = {}) {
        const db = getDatabase();
        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
        let query =
            'SELECT * FROM notices WHERE effective_time <= ? AND (expiration_time IS NULL OR expiration_time > ?)';
        const params = [now, now];

        if (filters.jurisdiction_type) {
            query += ' AND jurisdiction_type = ?';
            params.push(filters.jurisdiction_type);
        }

        if (filters.state) {
            query += ' AND jurisdiction = ?';
            params.push(filters.state);
        }

        query += ' ORDER BY effective_time DESC';

        try {
            const [rows] = await db.query(query, params);
            return rows;
        } catch (error) {
            console.error('Error fetching active notices:', error);
            return [];
        }
    },

    /**
     * Retrieve a single notice by its primary key.
     *
     * @param {number} id - Notice primary key
     * @returns {Promise<Object|null>} Notice row, or null if not found or on error
     */
    async getById(id) {
        const db = getDatabase();
        try {
            const [rows] = await db.query('SELECT * FROM notices WHERE id = ?', [id]);
            return rows[0] || null;
        } catch (error) {
            console.error('Error fetching notice by ID:', error);
            return null;
        }
    },

    /**
     * Count notices grouped by notice_type, optionally restricted to active notices.
     * Useful for dashboard summary widgets that display notice type breakdowns.
     *
     * @param {boolean} [activeOnly=true] - When true, only count notices within their
     *   effective window (effective_time <= NOW AND expiration_time > NOW or null)
     * @returns {Promise<Array<{notice_type: string, count: number}>>} Rows ordered by
     *   count DESC; empty array on error
     */
    async getCountByType(activeOnly = true) {
        const db = getDatabase();
        let query = 'SELECT notice_type, COUNT(*) as count FROM notices';

        if (activeOnly) {
            const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
            query += ' WHERE effective_time <= ? AND (expiration_time IS NULL OR expiration_time > ?)';
        }

        query += ' GROUP BY notice_type ORDER BY count DESC';

        try {
            if (activeOnly) {
                const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
                const [rows] = await db.query(query, [now, now]);
                return rows;
            } else {
                const [rows] = await db.query(query);
                return rows;
            }
        } catch (error) {
            console.error('Error counting by type:', error);
            return [];
        }
    }
};

module.exports = NoticeModel;
