/**
 * Sites API Routes
 * Endpoints for site data
 */

const express = require('express');
const router = express.Router();
const SiteModel = require('../models/site');
const AdvisoryModel = require('../models/advisory');
const SiteStatusModel = require('../models/siteStatus');
const cache = require('../utils/cache');

/**
 * GET /api/sites
 * Get all sites with optional filters
 * Query params: state, region
 */
router.get('/', async (req, res) => {
  try {
    const { state, region } = req.query;
    
    // Only cache requests with no filters (all sites)
    const hasFilters = state || region;
    
    if (!hasFilters) {
      const cached = cache.get(cache.CACHE_KEYS.ALL_SITES);
      if (cached) {
        return res.json(cached);
      }
    }
    
    console.log('[DEBUG] Fetching sites with filters:', { state, region });
    const sites = await SiteModel.getAll({ state, region });
    console.log('[DEBUG] Sites returned:', Array.isArray(sites), 'length:', sites ? sites.length : 'null');
    
    const response = { success: true, data: sites, count: sites.length };
    
    // Cache only unfiltered requests (longer TTL for static site data)
    if (!hasFilters) {
      cache.set(cache.CACHE_KEYS.ALL_SITES, response, cache.TTL.LONG);
    }
    
    res.json(response);
  } catch (error) {
    console.error('Error fetching sites:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/sites/states
 * Get list of all states with sites
 */
router.get('/states', async (req, res) => {
  try {
    // Check cache first (states rarely change)
    const cached = cache.get(cache.CACHE_KEYS.STATES_LIST);
    if (cached) {
      return res.json(cached);
    }
    
    const states = await SiteModel.getStates();
    const response = { success: true, data: states };
    
    // Cache for a long time (states list is static)
    cache.set(cache.CACHE_KEYS.STATES_LIST, response, cache.TTL.VERY_LONG);
    
    res.json(response);
  } catch (error) {
    console.error('Error fetching states:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/sites/regions
 * Get list of all regions
 */
router.get('/regions', async (req, res) => {
  try {
    // Check cache first (regions rarely change)
    const cached = cache.get(cache.CACHE_KEYS.REGIONS_LIST);
    if (cached) {
      return res.json(cached);
    }
    
    const regions = await SiteModel.getRegions();
    const response = { success: true, data: regions };
    
    // Cache for a long time (regions list is static)
    cache.set(cache.CACHE_KEYS.REGIONS_LIST, response, cache.TTL.VERY_LONG);
    
    res.json(response);
  } catch (error) {
    console.error('Error fetching regions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/sites/:id
 * Get site by ID with status and advisories
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const site = await SiteModel.getById(id);
    
    if (!site) {
      return res.status(404).json({ success: false, error: 'Site not found' });
    }
    
    // Add status and advisories
    const status = await SiteStatusModel.getBySite(id);
    const advisories = await AdvisoryModel.getBySite(id, true); // Active only
    
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
router.get('/:id/advisories', async (req, res) => {
  try {
    const { id } = req.params;
    const activeOnly = req.query.active_only === 'true';
    
    const site = await SiteModel.getById(id);
    if (!site) {
      return res.status(404).json({ success: false, error: 'Site not found' });
    }
    
    const advisories = await AdvisoryModel.getBySite(id, activeOnly);
    res.json({ success: true, data: advisories, count: advisories.length });
  } catch (error) {
    console.error('Error fetching site advisories:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
