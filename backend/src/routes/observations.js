/**
 * Observations API Routes
 * Endpoints for current weather observation data
 */

const express = require('express');
const router = express.Router();
const { param } = require('express-validator');
const ObservationModel = require('../models/observation');
const cache = require('../utils/cache');
const { handleValidationErrors } = require('../middleware/validate');

/**
 * GET /api/observations
 * Get all current weather observations for all offices
 */
router.get('/', async (req, res) => {
  try {
    const cacheKey = 'observations_all';
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const observations = await ObservationModel.getAll();
    const response = { success: true, data: observations, count: observations.length };

    cache.set(cacheKey, response, cache.TTL.SHORT);
    res.json(response);
  } catch (error) {
    console.error('Error fetching observations:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/observations/:officeCode
 * Get current weather observation for a specific office
 */
router.get('/:officeCode',
  param('officeCode')
    .trim()
    .isLength({ min: 1, max: 10 })
    .withMessage('Office code must be 1-10 characters'),
  handleValidationErrors,
  async (req, res) => {
    try {
      const { officeCode } = req.params;
      const observation = await ObservationModel.getByOfficeCode(officeCode);

      if (!observation) {
        return res.status(404).json({
          success: false,
          error: `No observation found for office ${officeCode}`
        });
      }

      res.json({ success: true, data: observation });
    } catch (error) {
      console.error('Error fetching observation:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

module.exports = router;
