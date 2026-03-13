/**
 * AdvisoryHistory Model
 *
 * Manages the advisory_history table, which stores periodic snapshots of each
 * office's advisory state for trend analysis and historical reporting.
 *
 * Snapshot cadence: every 6 hours (controlled by scheduler.js snapshot cron).
 * Retention: 30 days (enforced by cleanupOldHistory).
 *
 * At 300 offices × 4 snapshots/day × 30 days the table holds ~36,000 rows —
 * well within MariaDB's row-scan budget. Review ARCHITECTURE.md if the office
 * count grows beyond 500.
 *
 * @module AdvisoryHistory
 */

const { getDatabase } = require('../config/database');

class AdvisoryHistory {
    /**
     * Create a snapshot of the current advisory state for a single office.
     * Called during the historical snapshot capture cycle; one row per office
     * per snapshot run.
     *
     * @param {number} officeId       - Internal office ID (offices.id)
     * @param {Object} aggregatedData - Aggregated office data from OfficeAggregator;
     *   must contain: advisory_count, highest_severity, highest_severity_type,
     *   has_extreme, has_severe, has_moderate, new_count, upgrade_count, advisories[]
     * @returns {Promise<number>} The insert ID of the new advisory_history row
     */
    static async createSnapshot(officeId, aggregatedData) {
        const query = `
            INSERT INTO advisory_history (
                office_id, snapshot_time, advisory_count,
                highest_severity, highest_severity_type,
                has_extreme, has_severe, has_moderate,
                new_count, upgrade_count, advisory_snapshot
            ) VALUES (?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const advisorySnapshot = JSON.stringify({
            advisories: aggregatedData.advisories.map(a => ({
                id: a.id,
                type: a.advisory_type,
                severity: a.severity,
                action: a.vtec_action
            }))
        });
        
        const params = [
            officeId,
            aggregatedData.advisory_count,
            aggregatedData.highest_severity,
            aggregatedData.highest_severity_type,
            aggregatedData.has_extreme,
            aggregatedData.has_severe,
            aggregatedData.has_moderate,
            aggregatedData.new_count,
            aggregatedData.upgrade_count,
            advisorySnapshot
        ];
        
        const connection = getDatabase();
        const [result] = await connection.query(query, params);
        return result.insertId;
    }
    
    /**
     * Create advisory snapshots for all active (advisory-bearing) offices in parallel.
     * Uses Promise.all so the insert fan-out runs concurrently rather than sequentially;
     * at 300 offices this avoids a sequential 300-insert bottleneck on snapshot cycles.
     *
     * @param {Array<Object>} aggregatedSites - Array of aggregated office objects;
     *   each must have office_id and the fields required by createSnapshot
     * @returns {Promise<number[]>} Array of insert IDs, one per office
     */
    static async createSnapshotsForAllSites(aggregatedSites) {
        const promises = aggregatedSites.map(site => 
            this.createSnapshot(site.office_id, site)
        );
        
        return await Promise.all(promises);
    }
    
    /**
     * Retrieve advisory history rows for a single office within a lookback window.
     * Rows are returned in chronological order (oldest first) for timeline rendering
     * and trend calculation.
     *
     * Default of 7 days: 7-day window balances trend visibility vs. query cost at
     * current scale (300 offices × ~28 snapshots/week); see ARCHITECTURE.md for
     * scale thresholds.
     *
     * @param {number} officeId   - Internal office ID (offices.id)
     * @param {number} [days=7]   - Lookback window in days
     * @returns {Promise<Array<Object>>} advisory_history rows, ascending by snapshot_time
     */
    static async getHistoryForSite(officeId, days = 7) {
        const query = `
            SELECT * FROM advisory_history
            WHERE office_id = ?
            AND snapshot_time >= DATE_SUB(NOW(), INTERVAL ? DAY)
            ORDER BY snapshot_time ASC
        `;

        const connection = getDatabase();
        const [rows] = await connection.query(query, [officeId, days]);
        return rows;
    }
    
    /**
     * Retrieve the most recent advisory_history row for a single office.
     * Used by the office detail page to show the last known snapshot state.
     *
     * @param {number} officeId - Internal office ID (offices.id)
     * @returns {Promise<Object|null>} Most recent advisory_history row, or null if
     *   no history exists for the office
     */
    static async getLatestSnapshot(officeId) {
        const query = `
            SELECT * FROM advisory_history
            WHERE office_id = ?
            ORDER BY snapshot_time DESC
            LIMIT 1
        `;

        const connection = getDatabase();
        const [rows] = await connection.query(query, [officeId]);
        return rows[0] || null;
    }
    
    /**
     * Compute a trend summary for a single office by comparing the first and last
     * snapshots within the lookback window.
     * Trend direction is derived from severity rank changes (Extreme=4 … Minor=1);
     * an advisory-count delta is also returned for secondary analysis.
     * Returns 'insufficient_data' when fewer than 2 snapshots exist in the window.
     *
     * Default of 7 days: 7-day window balances trend visibility vs. query cost at
     * current scale (300 offices × ~28 snapshots/week); see ARCHITECTURE.md for
     * scale thresholds.
     *
     * @param {number} officeId  - Internal office ID (offices.id)
     * @param {number} [days=7]  - Lookback window in days
     * @returns {Promise<Object>} Trend object with keys:
     *   trend ('worsening'|'improving'|'stable'|'insufficient_data'),
     *   severity_change, advisory_change, first_severity, last_severity,
     *   first_count, last_count, duration_hours, history[]
     */
    static async getTrend(officeId, days = 7) {
        const history = await this.getHistoryForSite(officeId, days);
        
        if (history.length < 2) {
            return { trend: 'insufficient_data', history };
        }
        
        const first = history[0];
        const last = history[history.length - 1];
        
        // Severity ranking
        const severityRank = { 'Extreme': 4, 'Severe': 3, 'Moderate': 2, 'Minor': 1 };
        const firstRank = severityRank[first.highest_severity] || 0;
        const lastRank = severityRank[last.highest_severity] || 0;
        
        let trend = 'stable';
        if (lastRank > firstRank) {
            trend = 'worsening';
        } else if (lastRank < firstRank) {
            trend = 'improving';
        }
        
        // Calculate advisory count change
        const advisoryChange = last.advisory_count - first.advisory_count;
        
        return {
            trend,
            severity_change: lastRank - firstRank,
            advisory_change: advisoryChange,
            first_severity: first.highest_severity,
            last_severity: last.highest_severity,
            first_count: first.advisory_count,
            last_count: last.advisory_count,
            duration_hours: Math.floor((new Date(last.snapshot_time) - new Date(first.snapshot_time)) / (1000 * 60 * 60)),
            history
        };
    }
    
    /**
     * Retrieve trend summaries for all offices in a single optimised pass.
     *
     * Performance design:
     *   Issues a single SQL query to fetch all advisory_history rows in the window,
     *   then groups them by office_id in one O(n) JS pass — eliminating the N+1
     *   query fan-out that fired one getTrend() call per office (up to 300 concurrent
     *   queries at current scale). (closes #105)
     *
     * Default of 7 days: 7-day window balances trend visibility vs. query cost at
     * current scale (300 offices × ~28 snapshots/week); see ARCHITECTURE.md for
     * scale thresholds.
     *
     * @param {number} [days=7] - Lookback window in days applied to snapshot_time
     * @returns {Promise<Array<Object>>} Array of trend objects, one per office that
     *   has at least one history row in the window. Each object contains:
     *   office_id, trend ('increasing'|'decreasing'|'stable'),
     *   first_severity, last_severity, first_count, last_count,
     *   duration_hours, history[]
     */
    static async getAllTrends(days = 7) {
        const connection = getDatabase();
        const [rows] = await connection.query(`
            SELECT *
            FROM advisory_history
            WHERE snapshot_time >= DATE_SUB(NOW(), INTERVAL ? DAY)
            ORDER BY office_id, snapshot_time ASC
        `, [days]);

        // Group rows by office_id in one O(n) pass
        const byOffice = new Map();
        for (const row of rows) {
            if (!byOffice.has(row.office_id)) byOffice.set(row.office_id, []);
            byOffice.get(row.office_id).push(row);
        }

        const trends = [];
        for (const [officeId, history] of byOffice) {
            if (history.length === 0) continue;
            const first = history[0];
            const last = history[history.length - 1];
            trends.push({
                office_id: officeId,
                trend: history.length > 1
                    ? (last.advisory_count > first.advisory_count ? 'increasing'
                        : last.advisory_count < first.advisory_count ? 'decreasing' : 'stable')
                    : 'stable',
                first_severity: first.highest_severity,
                last_severity: last.highest_severity,
                first_count: first.advisory_count,
                last_count: last.advisory_count,
                duration_hours: Math.floor((new Date(last.snapshot_time) - new Date(first.snapshot_time)) / (1000 * 60 * 60)),
                history
            });
        }

        return trends;
    }
    
    /**
     * Delete advisory_history rows older than the retention window.
     * Called periodically by the ingestion scheduler to prevent unbounded table growth.
     * 30-day default retains enough history for monthly trend reporting while keeping
     * the table size manageable (~36,000 rows at 300 offices × 4 snapshots/day).
     *
     * @param {number} [daysToKeep=30] - Number of days of history to retain
     * @returns {Promise<number>} The number of rows deleted
     */
    static async cleanupOldHistory(daysToKeep = 30) {
        const query = `
            DELETE FROM advisory_history
            WHERE snapshot_time < DATE_SUB(NOW(), INTERVAL ? DAY)
        `;
        
        const connection = getDatabase();
        const [result] = await connection.query(query, [daysToKeep]);
        return result.affectedRows;
    }
}

module.exports = AdvisoryHistory;
