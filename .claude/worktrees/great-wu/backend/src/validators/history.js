/**
 * History Route Validators
 */

const { param } = require('express-validator');
const { validateDays, validateLimit, validateHours } = require('./common');

/**
 * Validate siteId parameter
 */
const validateSiteIdParam = param('siteId')
  .isInt({ min: 1 })
  .withMessage('siteId must be a positive integer')
  .toInt();

/**
 * Validators for GET /api/history/overview-trends
 */
const getOverviewTrends = [
  validateDays,
  validateLimit
];

/**
 * Validators for GET /api/history/severity-trends
 */
const getSeverityTrends = [
  validateDays
];

/**
 * Validators for GET /api/history/site-trends/:siteId
 */
const getSiteTrends = [
  validateSiteIdParam,
  validateHours
];

module.exports = {
  getOverviewTrends,
  getSeverityTrends,
  getSiteTrends
};
