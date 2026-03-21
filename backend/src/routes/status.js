/**
 * Status API Routes
 * Endpoints for office status and overview dashboard
 *
 * @generated AI-authored (Claude, Warp) — vanilla JS by design
 */

const express = require('express');
const router = express.Router();
const config = require('../config/config');
const OfficeModel = require('../models/office');
const AdvisoryModel = require('../models/advisory');
const OfficeStatusModel = require('../models/officeStatus');
const { getLastIngestionTime } = require('../ingestion/noaa-ingestor');
const { getSchedulerStatus } = require('../ingestion/scheduler');
const cache = require('../utils/cache');
const { handleValidationErrors } = require('../middleware/validate');
const statusValidators = require('../validators/status');

/**
 * Calculate the next scheduler-aligned ingestion time from the current server clock.
 * Scheduler uses an every-N-minutes cron expression aligned to minute 0.
 * @param {Date} now - Current server time
 * @param {number} intervalMinutes - Ingestion interval in minutes
 * @returns {Date} Next scheduled ingestion wall-clock time
 */
function getNextScheduledUpdateAt(now, intervalMinutes) {
    const safeInterval = Math.max(1, parseInt(intervalMinutes, 10) || 15);
    const next = new Date(now);
    next.setSeconds(0, 0);

    const currentMinute = next.getMinutes();
    const remainder = currentMinute % safeInterval;
    const minutesToAdd = remainder === 0 ? safeInterval : safeInterval - remainder;
    next.setMinutes(currentMinute + minutesToAdd);

    return next;
}

/**
 * GET /api/status/overview
 * Get dashboard overview statistics
 */
router.get('/overview', async (req, res) => {
    try {
        // Check cache first
        const cached = cache.get(cache.CACHE_KEYS.STATUS_OVERVIEW);
        if (cached) {
            return res.json(cached);
        }

        // Total offices
        const allOffices = await OfficeModel.getAll();
        const totalOffices = allOffices.length;

        // Active advisories
        const activeAdvisories = await AdvisoryModel.getActive();
        const totalActiveAdvisories = activeAdvisories.length;

        // Offices with active advisories
        const officesWithAdvisories = new Set(activeAdvisories.map((a) => a.office_id)).size;

        // Advisory count by severity
        const advisoriesBySeverity = await AdvisoryModel.getCountBySeverity(true);

        // Operational status counts
        const statusCounts = await OfficeStatusModel.getCountByStatus();

        // Weather impact level counts
        const weatherImpactCounts = await OfficeStatusModel.getCountByWeatherImpact();

        // Recently updated offices
        const recentlyUpdated = await OfficeStatusModel.getRecentlyUpdated(10);

        // Get last ingestion time
        const lastIngestion = await getLastIngestionTime();
        const updateIntervalMinutes = config.ingestion.intervalMinutes || 15;

        const response = {
            success: true,
            data: {
                total_offices: totalOffices,
                offices_with_advisories: officesWithAdvisories,
                total_active_advisories: totalActiveAdvisories,
                advisories_by_severity: advisoriesBySeverity,
                operational_status_counts: statusCounts,
                weather_impact_counts: weatherImpactCounts,
                recently_updated: recentlyUpdated,
                last_updated: lastIngestion?.lastUpdated || null,
                update_interval_minutes: updateIntervalMinutes
            }
        };

        // Cache the response
        cache.set(cache.CACHE_KEYS.STATUS_OVERVIEW, response, cache.TTL.SHORT);

        res.json(response);
    } catch (error) {
        console.error('Error fetching overview:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/status/timing
 * Lightweight timing metadata for countdown synchronization.
 * Always uncached so clients receive authoritative scheduler timing.
 */
router.get('/timing', async (req, res) => {
    try {
        const lastIngestion = await getLastIngestionTime();
        const schedulerStatus = getSchedulerStatus();
        const updateIntervalMinutes = config.ingestion.intervalMinutes || 15;
        const serverNow = new Date();
        const nextScheduled = getNextScheduledUpdateAt(serverNow, updateIntervalMinutes);

        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Surrogate-Control', 'no-store');

        res.json({
            success: true,
            data: {
                server_time: serverNow.toISOString(),
                last_updated: lastIngestion?.lastUpdated || null,
                update_interval_minutes: updateIntervalMinutes,
                ingestion_active: Boolean(schedulerStatus?.ingestion?.inProgress),
                scheduler_running: Boolean(schedulerStatus?.ingestion?.running),
                next_scheduled_update_at: nextScheduled.toISOString()
            }
        });
    } catch (error) {
        console.error('Error fetching timing metadata:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/status/offices-impacted
 * Get all impacted offices (Closed or At Risk)
 */
router.get('/offices-impacted', async (req, res) => {
    try {
        const impactedOffices = await OfficeStatusModel.getImpacted();
        res.json({ success: true, data: impactedOffices, count: impactedOffices.length });
    } catch (error) {
        console.error('Error fetching impacted offices:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/status/offices
 * Get all office statuses with optional filters
 * Query params: operational_status, state
 */
router.get('/offices', statusValidators.getSites, handleValidationErrors, async (req, res) => {
    try {
        const { operational_status, state } = req.query;
        const statuses = await OfficeStatusModel.getAll({ operational_status, state });
        res.json({ success: true, data: statuses, count: statuses.length });
    } catch (error) {
        console.error('Error fetching office statuses:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
