/**
 * Audit Log Model
 * Records administrative actions for governance and debugging. (closes #267)
 */

const { getDatabase } = require('../config/database');

const AuditLog = {
    /**
     * Record an administrative action.
     * @param {Object} entry
     * @param {string} entry.action - Action identifier (e.g., 'pause_ingestion')
     * @param {string} [entry.actor='api_key'] - Role or system identifier (not PII)
     * @param {Object|string} [entry.detail] - Action-specific context (serialized to JSON)
     * @param {string} [entry.ipAddress] - Client IP address
     * @returns {Promise<number>} The inserted log entry ID
     */
    async record({ action, actor = 'api_key', detail = null, ipAddress = null }) {
        const db = getDatabase();
        const detailJson = detail && typeof detail === 'object' ? JSON.stringify(detail) : detail;
        const [result] = await db.query(
            'INSERT INTO audit_log (action, actor, detail, ip_address) VALUES (?, ?, ?, ?)',
            [action, actor, detailJson, ipAddress]
        );
        return result.insertId;
    },

    /**
     * Get recent audit log entries.
     * @param {number} [limit=50] - Max entries to return
     * @returns {Promise<Array>} Log entries, newest first
     */
    async getRecent(limit = 50) {
        const db = getDatabase();
        const [rows] = await db.query('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?', [limit]);
        return rows;
    }
};

module.exports = AuditLog;
