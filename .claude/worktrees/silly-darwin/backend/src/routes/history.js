/**
 * History API Routes
 * Provides historical trend data for dashboard sparklines and analytics
 * 
 * Endpoints:
 * - GET /api/history/overview-trends - System-wide metrics over time
 * - GET /api/history/severity-trends - Severity counts over time
 * - GET /api/history/site-trends/:siteId - Per-site advisory counts over time
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { handleValidationErrors } = require('../middleware/validate');
const historyValidators = require('../validators/history');

/**
 * Helper: Calculate trend direction and percentage change
 * @param {Array} dataPoints - Array of numbers (oldest to newest)
 * @returns {Object} Trend analysis
 */
function calculateTrend(dataPoints) {
    if (!dataPoints || dataPoints.length < 2) {
        return { direction: 'stable', change: 0, changePercent: 0 };
    }
    
    // Compare most recent value to 24h ago (4 snapshots ago with 6-hour intervals)
    const current = dataPoints[dataPoints.length - 1] || 0;
    const previous = dataPoints[Math.max(0, dataPoints.length - 5)] || 0;  // 24h ago
    
    const change = current - previous;
    const changePercent = previous > 0 ? ((change / previous) * 100).toFixed(1) : 0;
    
    let direction = 'stable';
    if (change > 0) direction = 'up';
    else if (change < 0) direction = 'down';
    
    return { direction, change, changePercent: parseFloat(changePercent) };
}

/**
 * GET /api/history/overview-trends
 * Returns system-wide historical metrics for dashboard overview
 * Query params: ?days=3 (default), ?limit=20 (max snapshots)
 */
router.get('/overview-trends', historyValidators.getOverviewTrends, handleValidationErrors, async (req, res) => {
    try {
        const days = req.query.days || 3;
        const limit = req.query.limit || 20;
        
        const startTime = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
        
        const [snapshots] = await pool.query(`
            SELECT 
                snapshot_time,
                extreme_count, severe_count, moderate_count, minor_count,
                sites_red, sites_orange, sites_yellow, sites_green,
                sites_closed, sites_restricted, sites_pending, sites_open,
                new_advisories, continued_advisories, upgraded_advisories,
                total_advisories, total_sites_with_advisories
            FROM system_snapshots
            WHERE snapshot_time >= ?
            ORDER BY snapshot_time ASC
            LIMIT ?
        `, [startTime, limit]);
        
        if (snapshots.length === 0) {
            return res.json({
                status: 'no_data',
                message: 'Historical data is being accumulated. Check back in 6-12 hours.',
                timeRange: {
                    start: startTime,
                    end: new Date(),
                    snapshotsAvailable: 0
                },
                trends: null
            });
        }
        
        // Extract time series data
        const timestamps = snapshots.map(s => s.snapshot_time);
        const extremeCounts = snapshots.map(s => s.extreme_count);
        const severeCounts = snapshots.map(s => s.severe_count);
        const moderateCounts = snapshots.map(s => s.moderate_count);
        const minorCounts = snapshots.map(s => s.minor_count);
        
        const sitesRed = snapshots.map(s => s.sites_red);
        const sitesOrange = snapshots.map(s => s.sites_orange);
        const sitesYellow = snapshots.map(s => s.sites_yellow);
        const sitesGreen = snapshots.map(s => s.sites_green);
        
        const totalAdvisories = snapshots.map(s => s.total_advisories);
        const sitesImpacted = snapshots.map(s => s.total_sites_with_advisories);
        
        // Calculate trends
        const extremeTrend = calculateTrend(extremeCounts);
        const severeTrend = calculateTrend(severeCounts);
        const moderateTrend = calculateTrend(moderateCounts);
        const totalTrend = calculateTrend(totalAdvisories);
        
        res.json({
            status: 'success',
            timeRange: {
                start: timestamps[0],
                end: timestamps[timestamps.length - 1],
                snapshotsAvailable: snapshots.length,
                intervalHours: 6
            },
            severity: {
                timestamps,
                extreme: extremeCounts,
                severe: severeCounts,
                moderate: moderateCounts,
                minor: minorCounts
            },
            sitesByWeatherLevel: {
                timestamps,
                red: sitesRed,
                orange: sitesOrange,
                yellow: sitesYellow,
                green: sitesGreen
            },
            totals: {
                timestamps,
                advisories: totalAdvisories,
                sitesImpacted: sitesImpacted
            },
            trends: {
                extreme: extremeTrend,
                severe: severeTrend,
                moderate: moderateTrend,
                total: totalTrend
            }
        });
        
    } catch (error) {
        console.error('Error fetching overview trends:', error);
        res.status(500).json({ error: 'Failed to fetch historical trends' });
    }
});

/**
 * GET /api/history/severity-trends
 * Returns severity-specific trends for sparklines
 * Query params: ?days=3 (default)
 */
router.get('/severity-trends', historyValidators.getSeverityTrends, handleValidationErrors, async (req, res) => {
    try {
        const days = req.query.days || 3;
        const startTime = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
        
        const [snapshots] = await pool.query(`
            SELECT 
                snapshot_time,
                extreme_count, severe_count, moderate_count, minor_count
            FROM system_snapshots
            WHERE snapshot_time >= ?
            ORDER BY snapshot_time ASC
        `, [startTime]);
        
        if (snapshots.length === 0) {
            return res.json({
                status: 'no_data',
                message: 'Historical data is being accumulated.',
                timeRange: { start: startTime, end: new Date(), points: 0 },
                trends: null
            });
        }
        
        const timestamps = snapshots.map(s => s.snapshot_time);
        const extremeCounts = snapshots.map(s => s.extreme_count);
        const severeCounts = snapshots.map(s => s.severe_count);
        const moderateCounts = snapshots.map(s => s.moderate_count);
        
        res.json({
            status: 'success',
            timeRange: {
                start: timestamps[0],
                end: timestamps[timestamps.length - 1],
                points: snapshots.length
            },
            trends: {
                timestamps,
                critical: extremeCounts,   // Map to UI terminology
                high: severeCounts,
                moderate: moderateCounts,
                low: snapshots.map(s => s.minor_count)
            },
            direction: {
                critical: calculateTrend(extremeCounts),
                high: calculateTrend(severeCounts),
                moderate: calculateTrend(moderateCounts)
            }
        });
        
    } catch (error) {
        console.error('Error fetching severity trends:', error);
        res.status(500).json({ error: 'Failed to fetch severity trends' });
    }
});

/**
 * GET /api/history/site-trends/:siteId
 * Returns per-site advisory count history
 * Query params: ?days=3 (default)
 */
router.get('/site-trends/:siteId', historyValidators.getSiteTrends, handleValidationErrors, async (req, res) => {
    try {
        const siteId = req.params.siteId;
        const days = req.query.days || 3;
        
        const startTime = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
        
        // Get site info
        const [sites] = await pool.query(`
            SELECT id, site_code, name, city, state
            FROM sites
            WHERE id = ?
        `, [siteId]);
        
        if (sites.length === 0) {
            return res.status(404).json({ error: 'Site not found' });
        }
        
        const site = sites[0];
        
        // Get historical data
        const [history] = await pool.query(`
            SELECT 
                snapshot_time,
                advisory_count,
                highest_severity,
                highest_severity_type,
                has_extreme,
                has_severe,
                has_moderate,
                new_count,
                upgrade_count
            FROM advisory_history
            WHERE site_id = ? AND snapshot_time >= ?
            ORDER BY snapshot_time ASC
        `, [siteId, startTime]);
        
        if (history.length === 0) {
            return res.json({
                status: 'no_data',
                message: 'Historical data is being accumulated for this site.',
                site,
                timeRange: { start: startTime, end: new Date(), points: 0 },
                trends: null
            });
        }
        
        const timestamps = history.map(h => h.snapshot_time);
        const advisoryCounts = history.map(h => h.advisory_count);
        const hasExtreme = history.map(h => h.has_extreme);
        const hasSevere = history.map(h => h.has_severe);
        const hasModerate = history.map(h => h.has_moderate);
        
        res.json({
            status: 'success',
            site,
            timeRange: {
                start: timestamps[0],
                end: timestamps[timestamps.length - 1],
                points: history.length
            },
            trends: {
                timestamps,
                advisoryCount: advisoryCounts,
                hasExtreme,
                hasSevere,
                hasModerate
            },
            direction: calculateTrend(advisoryCounts),
            current: {
                advisoryCount: advisoryCounts[advisoryCounts.length - 1] || 0,
                highestSeverity: history[history.length - 1]?.highest_severity || null,
                highestSeverityType: history[history.length - 1]?.highest_severity_type || null
            }
        });
        
    } catch (error) {
        console.error(`Error fetching site trends for site ${req.params.siteId}:`, error);
        res.status(500).json({ error: 'Failed to fetch site trends' });
    }
});

/**
 * GET /api/history/data-availability
 * Returns information about available historical data
 */
router.get('/data-availability', async (req, res) => {
    try {
        const [systemCount] = await pool.query(`
            SELECT 
                COUNT(*) as snapshot_count,
                MIN(snapshot_time) as earliest_snapshot,
                MAX(snapshot_time) as latest_snapshot
            FROM system_snapshots
        `);
        
        const [siteCount] = await pool.query(`
            SELECT COUNT(DISTINCT snapshot_time) as snapshot_count
            FROM advisory_history
        `);
        
        const system = systemCount[0];
        const sites = siteCount[0];
        
        // Calculate hours of data available
        const hoursAvailable = system.earliest_snapshot ? 
            ((new Date() - new Date(system.earliest_snapshot)) / (1000 * 60 * 60)).toFixed(1) : 0;
        
        // Determine if enough data for meaningful trends (need at least 24 hours)
        const hasEnoughData = hoursAvailable >= 24;
        
        res.json({
            systemSnapshots: {
                count: system.snapshot_count,
                earliest: system.earliest_snapshot,
                latest: system.latest_snapshot,
                hoursAvailable: parseFloat(hoursAvailable)
            },
            siteSnapshots: {
                count: sites.snapshot_count
            },
            status: hasEnoughData ? 'ready' : 'accumulating',
            message: hasEnoughData ? 
                'Historical data available for trend analysis' : 
                `Accumulating data (${hoursAvailable}h of 24h minimum)`,
            recommendation: hasEnoughData ? 
                'Trends and sparklines can be displayed' : 
                'Show "Accumulating data..." message in UI'
        });
        
    } catch (error) {
        console.error('Error checking data availability:', error);
        res.status(500).json({ error: 'Failed to check data availability' });
    }
});

module.exports = router;
