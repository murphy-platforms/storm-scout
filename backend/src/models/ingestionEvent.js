/**
 * Ingestion Event Model
 * Replaces file-based .last-ingestion.json with transactional DB tracking.
 * Records start/end/status of each ingestion cycle. (closes #264)
 */

const { getDatabase } = require('../config/database');

const IngestionEvent = {
    /**
     * Record the start of an ingestion cycle.
     * @returns {Promise<number>} The inserted event ID
     */
    async recordStart() {
        const db = getDatabase();
        const [result] = await db.query(`INSERT INTO ingestion_events (started_at, status) VALUES (NOW(), 'running')`);
        return result.insertId;
    },

    /**
     * Record a successful ingestion cycle.
     * @param {number} eventId - The event ID from recordStart()
     * @param {Object} stats - Ingestion statistics
     * @param {number} stats.advisoriesCreated
     * @param {number} stats.advisoriesExpired
     * @param {number} stats.durationMs
     */
    async recordSuccess(eventId, { advisoriesCreated = 0, advisoriesExpired = 0, durationMs = 0 } = {}) {
        const db = getDatabase();
        await db.query(
            `UPDATE ingestion_events
             SET status = 'success', completed_at = NOW(),
                 advisories_created = ?, advisories_expired = ?, duration_ms = ?
             WHERE id = ?`,
            [advisoriesCreated, advisoriesExpired, durationMs, eventId]
        );
    },

    /**
     * Record a failed ingestion cycle.
     * @param {number} eventId - The event ID from recordStart()
     * @param {string} errorMessage - Error description
     * @param {number} durationMs - Elapsed time in milliseconds
     */
    async recordFailure(eventId, errorMessage, durationMs = 0) {
        const db = getDatabase();
        await db.query(
            `UPDATE ingestion_events
             SET status = 'failure', completed_at = NOW(),
                 error_message = ?, duration_ms = ?
             WHERE id = ?`,
            [errorMessage, durationMs, eventId]
        );
    },

    async recordTimeout(eventId, durationMs = 0) {
        const db = getDatabase();
        await db.query(
            `UPDATE ingestion_events
             SET status = 'timeout', completed_at = NOW(),
                 error_message = 'Cycle exceeded maximum duration', duration_ms = ?
             WHERE id = ?`,
            [durationMs, eventId]
        );
    },

    /**
     * Get the last successful ingestion timestamp.
     * Used by X-Data-Age header and health checks.
     * @returns {Promise<{lastUpdated: string, minutesAgo: number}|null>}
     */
    async getLastSuccessful() {
        const db = getDatabase();
        const [rows] = await db.query(
            `SELECT completed_at FROM ingestion_events
             WHERE status = 'success'
             ORDER BY completed_at DESC LIMIT 1`
        );
        if (!rows.length || !rows[0].completed_at) return null;
        const completed = new Date(rows[0].completed_at);
        return {
            lastUpdated: completed.toISOString(),
            minutesAgo: Math.round((Date.now() - completed.getTime()) / 60000)
        };
    }
};

module.exports = IngestionEvent;
