const { getDatabase } = require('../config/database');

class AdvisoryHistory {
    /**
     * Create a snapshot of current advisory state for a site
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
     * Create snapshots for all active sites
     */
    static async createSnapshotsForAllSites(aggregatedSites) {
        const promises = aggregatedSites.map(site => 
            this.createSnapshot(site.office_id, site)
        );
        
        return await Promise.all(promises);
    }
    
    /**
     * Get historical data for a site (last N days)
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
     * Get latest snapshot for a site
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
     * Get trend for a site (comparing first vs last snapshot)
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
     * Get all sites with trends
     */
    static async getAllTrends(days = 7) {
        // Get all sites that have history
        const query = `
            SELECT DISTINCT office_id
            FROM advisory_history
            WHERE snapshot_time >= DATE_SUB(NOW(), INTERVAL ? DAY)
        `;
        
        const connection = getDatabase();
        const [rows] = await connection.query(query, [days]);
        const officeIds = rows.map(r => r.office_id);

        const trends = await Promise.all(
            officeIds.map(async officeId => ({
                office_id: officeId,
                ...(await this.getTrend(officeId, days))
            }))
        );
        
        return trends;
    }
    
    /**
     * Clean up old history (keep last 30 days)
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
