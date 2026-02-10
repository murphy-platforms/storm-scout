/**
 * Sites API Routes
 * Endpoints for site data
 */

const express = require('express');
const router = express.Router();
const SiteModel = require('../models/site');
const AdvisoryModel = require('../models/advisory');
const SiteStatusModel = require('../models/siteStatus');

/**
 * GET /api/sites
 * Get all sites with optional filters
 * Query params: state, region
 */
router.get('/', (req, res) => {
  try {
    const { state, region } = req.query;
    const sites = SiteModel.getAll({ state, region });
    res.json({ success: true, data: sites, count: sites.length });
  } catch (error) {
    console.error('Error fetching sites:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/sites/states
 * Get list of all states with sites
 */
router.get('/states', (req, res) => {
  try {
    const states = SiteModel.getStates();
    res.json({ success: true, data: states });
  } catch (error) {
    console.error('Error fetching states:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/sites/regions
 * Get list of all regions
 */
router.get('/regions', (req, res) => {
  try {
    const regions = SiteModel.getRegions();
    res.json({ success: true, data: regions });
  } catch (error) {
    console.error('Error fetching regions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/sites/:id
 * Get site by ID with status and advisories
 */
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const site = SiteModel.getById(id);
    
    if (!site) {
      return res.status(404).json({ success: false, error: 'Site not found' });
    }
    
    // Add status and advisories
    const status = SiteStatusModel.getBySite(id);
    const advisories = AdvisoryModel.getBySite(id, true); // Active only
    
    res.json({
      success: true,
      data: {
        ...site,
        status: status || { operational_status: 'Open', reason: null },
        active_advisories: advisories
      }
    });
  } catch (error) {
    console.error('Error fetching site:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/sites/:id/advisories
 * Get all advisories for a specific site
 * Query params: active_only (boolean)
 */
router.get('/:id/advisories', (req, res) => {
  try {
    const { id } = req.params;
    const activeOnly = req.query.active_only === 'true';
    
    const site = SiteModel.getById(id);
    if (!site) {
      return res.status(404).json({ success: false, error: 'Site not found' });
    }
    
    const advisories = AdvisoryModel.getBySite(id, activeOnly);
    res.json({ success: true, data: advisories, count: advisories.length });
  } catch (error) {
    console.error('Error fetching site advisories:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
