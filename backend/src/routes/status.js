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
const cache = require('../utils/cache');
const { handleValidationErrors } = require('../middleware/validate');
const statusValidators = require('../validators/status');

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
