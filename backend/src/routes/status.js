/**
 * Status API Routes
 * Endpoints for site status and overview dashboard
 */

const express = require('express');
const router = express.Router();
const SiteModel = require('../models/site');
const AdvisoryModel = require('../models/advisory');
const SiteStatusModel = require('../models/siteStatus');

/**
 * GET /api/status/overview
 * Get dashboard overview statistics
 */
router.get('/overview', (req, res) => {
  try {
    // Total sites
    const allSites = SiteModel.getAll();
    const totalSites = allSites.length;
    
    // Active advisories
    const activeAdvisories = AdvisoryModel.getActive();
    const totalActiveAdvisories = activeAdvisories.length;
    
    // Sites with active advisories
    const sitesWithAdvisories = new Set(activeAdvisories.map(a => a.site_id)).size;
    
    // Advisory count by severity
    const advisoriesBySeverity = AdvisoryModel.getCountBySeverity(true);
    
    // Site status counts
    const statusCounts = SiteStatusModel.getCountByStatus();
    
    // Recently updated sites
    const recentlyUpdated = SiteStatusModel.getRecentlyUpdated(10);
    
    res.json({
      success: true,
      data: {
        total_sites: totalSites,
        sites_with_advisories: sitesWithAdvisories,
        total_active_advisories: totalActiveAdvisories,
        advisories_by_severity: advisoriesBySeverity,
        status_counts: statusCounts,
        recently_updated: recentlyUpdated
      }
    });
  } catch (error) {
    console.error('Error fetching overview:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/status/sites-impacted
 * Get all impacted sites (Closed or At Risk)
 */
router.get('/sites-impacted', (req, res) => {
  try {
    const impactedSites = SiteStatusModel.getImpacted();
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
router.get('/sites', (req, res) => {
  try {
    const { operational_status, state } = req.query;
    const statuses = SiteStatusModel.getAll({ operational_status, state });
    res.json({ success: true, data: statuses, count: statuses.length });
  } catch (error) {
    console.error('Error fetching site statuses:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
