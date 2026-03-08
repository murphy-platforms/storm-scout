/**
 * Historical Snapshot Capture Script
 * Captures system-wide and per-site advisory data for trend analysis
 * Runs every 6 hours via cron scheduler
 * Retains 3 days of data (12 snapshots)
 */

const { getDatabase } = require('../config/database');

async function captureSnapshot() {
    const pool = getDatabase();
    const connection = await pool.getConnection();
    console.log('[Snapshot] Starting historical snapshot capture...');
    
    try {
        await connection.beginTransaction();
        
        const snapshotTime = new Date();
        console.log(`[Snapshot] Timestamp: ${snapshotTime.toISOString()}`);
        
        // ========================================
        // 1. CAPTURE SYSTEM-WIDE AGGREGATES
        // ========================================
        
        // Count advisories by severity
        const [severityCounts] = await connection.query(`
            SELECT 
                severity,
                COUNT(*) as count
            FROM advisories 
            WHERE status = 'active'
            GROUP BY severity
        `);
        
        const severityMap = {
            extreme_count: 0,
            severe_count: 0,
            moderate_count: 0,
            minor_count: 0
        };
        
        severityCounts.forEach(row => {
            if (row.severity === 'Extreme') severityMap.extreme_count = row.count;
            if (row.severity === 'Severe') severityMap.severe_count = row.count;
            if (row.severity === 'Moderate') severityMap.moderate_count = row.count;
            if (row.severity === 'Minor') severityMap.minor_count = row.count;
        });
        
        // Count sites by weather impact level
        const [weatherImpact] = await connection.query(`
            SELECT 
                weather_impact_level,
                COUNT(*) as count
            FROM office_status
            GROUP BY weather_impact_level
        `);
        
        const weatherMap = {
            sites_red: 0,
            sites_orange: 0,
            sites_yellow: 0,
            sites_green: 0
        };
        
        weatherImpact.forEach(row => {
            if (row.weather_impact_level === 'red') weatherMap.sites_red = row.count;
            if (row.weather_impact_level === 'orange') weatherMap.sites_orange = row.count;
            if (row.weather_impact_level === 'yellow') weatherMap.sites_yellow = row.count;
            if (row.weather_impact_level === 'green') weatherMap.sites_green = row.count;
        });
        
        // Count sites by operational status
        const [opsStatus] = await connection.query(`
            SELECT 
                operational_status,
                COUNT(*) as count
            FROM office_status
            GROUP BY operational_status
        `);
        
        const opsMap = {
            sites_closed: 0,
            sites_restricted: 0,
            sites_pending: 0,
            sites_open: 0
        };
        
        opsStatus.forEach(row => {
            if (row.operational_status === 'closed') opsMap.sites_closed = row.count;
            if (row.operational_status === 'open_restricted') opsMap.sites_restricted = row.count;
            if (row.operational_status === 'pending') opsMap.sites_pending = row.count;
            if (row.operational_status === 'open_normal') opsMap.sites_open = row.count;
        });
        
        // Count advisory actions
        const [actionCounts] = await connection.query(`
            SELECT 
                vtec_action,
                COUNT(*) as count
            FROM advisories 
            WHERE status = 'active'
            GROUP BY vtec_action
        `);
        
        const actionMap = {
            new_advisories: 0,
            continued_advisories: 0,
            upgraded_advisories: 0
        };
        
        actionCounts.forEach(row => {
            if (row.vtec_action === 'NEW') actionMap.new_advisories = row.count;
            if (row.vtec_action === 'CON') actionMap.continued_advisories = row.count;
            if (row.vtec_action === 'UPG') actionMap.upgraded_advisories = row.count;
        });
        
        // Total metrics
        const [totalMetrics] = await connection.query(`
            SELECT 
                COUNT(DISTINCT a.id) as total_advisories,
                COUNT(DISTINCT a.office_id) as total_sites_with_advisories
            FROM advisories a
            WHERE a.status = 'active'
        `);
        
        const totals = totalMetrics[0] || { total_advisories: 0, total_sites_with_advisories: 0 };
        
        // Insert system snapshot
        await connection.query(`
            INSERT INTO system_snapshots (
                snapshot_time,
                extreme_count, severe_count, moderate_count, minor_count,
                sites_red, sites_orange, sites_yellow, sites_green,
                sites_closed, sites_restricted, sites_pending, sites_open,
                new_advisories, continued_advisories, upgraded_advisories,
                total_advisories, total_sites_with_advisories
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            snapshotTime,
            severityMap.extreme_count, severityMap.severe_count, 
            severityMap.moderate_count, severityMap.minor_count,
            weatherMap.sites_red, weatherMap.sites_orange, 
            weatherMap.sites_yellow, weatherMap.sites_green,
            opsMap.sites_closed, opsMap.sites_restricted,
            opsMap.sites_pending, opsMap.sites_open,
            actionMap.new_advisories, actionMap.continued_advisories, 
            actionMap.upgraded_advisories,
            totals.total_advisories, totals.total_sites_with_advisories
        ]);
        
        console.log(`[Snapshot] System aggregate captured: ${totals.total_advisories} advisories, ${totals.total_sites_with_advisories} sites impacted`);
        
        // ========================================
        // 2. CAPTURE PER-SITE DATA
        // ========================================
        
        // Get all sites with their current advisory state
        const [siteData] = await connection.query(`
            SELECT 
                s.id as office_id,
                s.office_code,
                COUNT(a.id) as advisory_count,
                MAX(CASE 
                    WHEN a.severity = 'Extreme' THEN 4
                    WHEN a.severity = 'Severe' THEN 3
                    WHEN a.severity = 'Moderate' THEN 2
                    WHEN a.severity = 'Minor' THEN 1
                    ELSE 0
                END) as severity_rank,
                MAX(a.severity) as highest_severity,
                MAX(a.advisory_type) as highest_severity_type,
                MAX(CASE WHEN a.severity = 'Extreme' THEN 1 ELSE 0 END) as has_extreme,
                MAX(CASE WHEN a.severity = 'Severe' THEN 1 ELSE 0 END) as has_severe,
                MAX(CASE WHEN a.severity = 'Moderate' THEN 1 ELSE 0 END) as has_moderate,
                SUM(CASE WHEN a.vtec_action = 'NEW' THEN 1 ELSE 0 END) as new_count,
                SUM(CASE WHEN a.vtec_action = 'UPG' THEN 1 ELSE 0 END) as upgrade_count
            FROM offices s
            LEFT JOIN advisories a ON s.id = a.office_id AND a.status = 'active'
            GROUP BY s.id, s.office_code
        `);
        
        console.log(`[Snapshot] Processing ${siteData.length} sites...`);
        
        // Insert per-site snapshots in batch
        if (siteData.length > 0) {
            const values = siteData.map(site => [
                site.office_id,
                snapshotTime,
                site.advisory_count || 0,
                site.highest_severity || null,
                site.highest_severity_type || null,
                site.has_extreme || 0,
                site.has_severe || 0,
                site.has_moderate || 0,
                site.new_count || 0,
                site.upgrade_count || 0,
                null  // advisory_snapshot - can add detailed JSON if needed
            ]);
            
            await connection.query(`
                INSERT INTO advisory_history (
                    office_id, snapshot_time, advisory_count, highest_severity,
                    highest_severity_type, has_extreme, has_severe, has_moderate,
                    new_count, upgrade_count, advisory_snapshot
                ) VALUES ?
            `, [values]);
        }
        
        console.log(`[Snapshot] Per-site data captured for ${siteData.length} sites`);
        
        // ========================================
        // 3. CLEANUP OLD DATA (retain only 3 days)
        // ========================================
        
        const retentionDate = new Date(Date.now() - (3 * 24 * 60 * 60 * 1000)); // 3 days ago
        
        const [deletedSystem] = await connection.query(`
            DELETE FROM system_snapshots 
            WHERE snapshot_time < ?
        `, [retentionDate]);
        
        const [deletedSites] = await connection.query(`
            DELETE FROM advisory_history 
            WHERE snapshot_time < ?
        `, [retentionDate]);
        
        console.log(`[Snapshot] Cleanup: Removed ${deletedSystem.affectedRows} system snapshots, ${deletedSites.affectedRows} site snapshots older than ${retentionDate.toISOString()}`);
        
        await connection.commit();
        console.log('[Snapshot] ✓ Snapshot capture completed successfully');
        
        return {
            success: true,
            snapshot_time: snapshotTime,
            system_metrics: {
                ...severityMap,
                ...weatherMap,
                ...opsMap,
                ...totals
            },
            sites_captured: siteData.length,
            cleanup: {
                system_deleted: deletedSystem.affectedRows,
                sites_deleted: deletedSites.affectedRows
            }
        };
        
    } catch (error) {
        await connection.rollback();
        console.error('[Snapshot] ERROR:', error);
        throw error;
    } finally {
        connection.release();
    }
}

// Run if called directly
if (require.main === module) {
    captureSnapshot()
        .then(result => {
            console.log('[Snapshot] Result:', JSON.stringify(result, null, 2));
            process.exit(0);
        })
        .catch(error => {
            console.error('[Snapshot] FATAL:', error);
            process.exit(1);
        });
}

module.exports = { captureSnapshot };
