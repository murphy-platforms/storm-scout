/**
 * Advisories API Routes
 * Endpoints for weather advisories
 */

const express = require('express');
const router = express.Router();
const AdvisoryModel = require('../models/advisory');

/**
 * GET /api/advisories
 * Get all advisories with optional filters
 * Query params: status, severity, state, site_id
 */
router.get('/', (req, res) => {
  try {
    const { status, severity, state, site_id } = req.query;
    const advisories = AdvisoryModel.getAll({ status, severity, state, site_id });
    res.json({ success: true, data: advisories, count: advisories.length });
  } catch (error) {
    console.error('Error fetching advisories:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/advisories/active
 * Get all active advisories with optional filters
 * Query params: severity, state
 */
router.get('/active', (req, res) => {
  try {
    const { severity, state } = req.query;
    const advisories = AdvisoryModel.getActive({ severity, state });
    res.json({ success: true, data: advisories, count: advisories.length });
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
router.get('/recent', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const advisories = AdvisoryModel.getRecentlyUpdated(limit);
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
router.get('/stats', (req, res) => {
  try {
    const bySeverity = AdvisoryModel.getCountBySeverity(true);
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
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const advisory = AdvisoryModel.getById(id);
    
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
