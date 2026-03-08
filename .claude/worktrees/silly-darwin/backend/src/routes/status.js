/**
 * Status API Routes
 * Endpoints for site status and overview dashboard
 */

const express = require('express');
const router = express.Router();
const config = require('../config/config');
const SiteModel = require('../models/site');
const AdvisoryModel = require('../models/advisory');
const SiteStatusModel = require('../models/siteStatus');
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

    // Cache miss - query database
    // Total sites
    const allSites = await SiteModel.getAll();
    const totalSites = allSites.length;
    
    // Active advisories
    const activeAdvisories = await AdvisoryModel.getActive();
    const totalActiveAdvisories = activeAdvisories.length;
    
    // Sites with active advisories
    const sitesWithAdvisories = new Set(activeAdvisories.map(a => a.site_id)).size;
    
    // Advisory count by severity
    const advisoriesBySeverity = await AdvisoryModel.getCountBySeverity(true);
    
    // Operational status counts
    const statusCounts = await SiteStatusModel.getCountByStatus();
    
    // Weather impact level counts
    const weatherImpactCounts = await SiteStatusModel.getCountByWeatherImpact();
    
    // Recently updated sites
    const recentlyUpdated = await SiteStatusModel.getRecentlyUpdated(10);
    
    // Get last ingestion time
    const lastIngestion = getLastIngestionTime();
    const updateIntervalMinutes = config.ingestion.intervalMinutes || 15;
    
    const response = {
      success: true,
      data: {
        total_sites: totalSites,
        sites_with_advisories: sitesWithAdvisories,
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
 * GET /api/status/sites-impacted
 * Get all impacted sites (Closed or At Risk)
 */
router.get('/sites-impacted', async (req, res) => {
  try {
    const impactedSites = await SiteStatusModel.getImpacted();
    res.json({ success: true, data: impactedSites, count: impactedSites.length });
  } catch (error) {
    console.error('Error fetching impacted sites:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/status/sites
 * Get all site statuses with optional filters
 * Query params: operational_status, state
 */
router.get('/sites', statusValidators.getSites, handleValidationErrors, async (req, res) => {
  try {
    const { operational_status, state } = req.query;
    const statuses = await SiteStatusModel.getAll({ operational_status, state });
    res.json({ success: true, data: statuses, count: statuses.length });
  } catch (error) {
    console.error('Error fetching site statuses:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
