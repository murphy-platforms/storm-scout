/**
 * Advisories API Routes
 * Endpoints for weather advisories
 */

const express = require('express');
const router = express.Router();
const AdvisoryModel = require('../models/advisory');
const cache = require('../utils/cache');
const { handleValidationErrors } = require('../middleware/validate');
const advisoryValidators = require('../validators/advisories');

/**
 * GET /api/advisories
 * Get all advisories with optional filters
 * Query params: status, severity (comma-separated), state, site_id, advisory_type (comma-separated)
 * Example: /api/advisories?severity=Extreme,Severe&state=CA
 */
router.get('/', advisoryValidators.getAll, handleValidationErrors, async (req, res) => {
  try {
    const { status, severity, state, site_id, advisory_type } = req.query;
    const advisories = await AdvisoryModel.getAll({ status, severity, state, site_id, advisory_type });
    res.json({ success: true, data: advisories, count: advisories.length });
  } catch (error) {
    console.error('Error fetching advisories:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/advisories/active
 * Get all active advisories with optional filters
 * Query params: severity (comma-separated), state, advisory_type (comma-separated)
 * Example: /api/advisories/active?severity=Extreme,Severe
 */
router.get('/active', advisoryValidators.getActive, handleValidationErrors, async (req, res) => {
  try {
    const { severity, state, advisory_type } = req.query;
    
    // Only cache requests with no filters
    const hasFilters = severity || state || advisory_type;
    
    if (!hasFilters) {
      const cached = cache.get(cache.CACHE_KEYS.ACTIVE_ADVISORIES);
      if (cached) {
        return res.json(cached);
      }
    }
    
    const advisories = await AdvisoryModel.getActive({ severity, state, advisory_type });
    const response = { success: true, data: advisories, count: advisories.length };
    
    // Cache only unfiltered requests
    if (!hasFilters) {
      cache.set(cache.CACHE_KEYS.ACTIVE_ADVISORIES, response, cache.TTL.SHORT);
    }
    
    res.json(response);
  } catch (error) {
    console.error('Error fetching active advisories:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/advisories/recent
 * Get recently updated advisories
 * Query params: limit (default 10)
 */
router.get('/recent', advisoryValidators.getRecent, handleValidationErrors, async (req, res) => {
  try {
    const limit = req.query.limit || 10;
    const advisories = await AdvisoryModel.getRecentlyUpdated(limit);
    res.json({ success: true, data: advisories });
  } catch (error) {
    console.error('Error fetching recent advisories:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/advisories/stats
 * Get advisory statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const bySeverity = await AdvisoryModel.getCountBySeverity(true);
    res.json({ success: true, data: { by_severity: bySeverity } });
  } catch (error) {
    console.error('Error fetching advisory stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/advisories/:id
 * Get advisory by ID
 */
router.get('/:id', advisoryValidators.getById, handleValidationErrors, async (req, res) => {
  try {
    const { id } = req.params;
    const advisory = await AdvisoryModel.getById(id);
    
    if (!advisory) {
      return res.status(404).json({ success: false, error: 'Advisory not found' });
    }
    
    res.json({ success: true, data: advisory });
  } catch (error) {
    console.error('Error fetching advisory:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
