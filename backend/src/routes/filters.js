/**
 * Filter API Routes
 * Endpoints for alert type filtering and configuration
 */

const express = require('express');
const router = express.Router();
const {
  getAllFilters,
  getFilterConfig,
  getAlertTypesByLevel,
  getImpactLevel,
  NOAA_ALERT_TYPES
} = require('../config/noaa-alert-types');

/**
 * GET /api/filters
 * Get all available filter presets
 */
router.get('/', (req, res) => {
  try {
    const filters = getAllFilters();
    res.json({
      success: true,
      data: filters
    });
  } catch (error) {
    console.error('Error fetching filters:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/filters/types/all
 * Get all alert types organized by impact level
 * NOTE: must be registered before /:filterName to prevent Express
 * matching "types" as the filterName parameter.
 */
router.get('/types/all', (req, res) => {
  try {
    res.json({
      success: true,
      data: NOAA_ALERT_TYPES
    });
  } catch (error) {
    console.error('Error fetching alert types:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/filters/types/:level
 * Get alert types for a specific impact level
 * NOTE: must be registered before /:filterName.
 */
router.get('/types/:level', (req, res) => {
  try {
    const { level } = req.params;
    const types = getAlertTypesByLevel(level.toUpperCase());

    res.json({
      success: true,
      data: types,
      count: types.length
    });
  } catch (error) {
    console.error('Error fetching alert types by level:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/filters/:filterName
 * Get specific filter configuration
 */
router.get('/:filterName', (req, res) => {
  try {
    const { filterName } = req.params;
    const filter = getFilterConfig(filterName.toUpperCase());

    if (!filter) {
      return res.status(404).json({
        success: false,
        error: 'Filter not found'
      });
    }

    res.json({
      success: true,
      data: filter
    });
  } catch (error) {
    console.error('Error fetching filter:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
