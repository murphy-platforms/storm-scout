/**
 * History Route Validators
 */

const { param } = require('express-validator');
const { validateDays, validateLimit, validateHours } = require('./common');

/**
 * Validate officeId parameter
 */
const validateOfficeIdParam = param('officeId')
  .isInt({ min: 1 })
  .withMessage('officeId must be a positive integer')
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
 * Validators for GET /api/history/office-trends/:officeId
 */
const getOfficeTrends = [
  validateOfficeIdParam,
  validateHours
];

module.exports = {
  getOverviewTrends,
  getSeverityTrends,
  getOfficeTrends
};
