/**
 * Status Route Validators
 */

const { query } = require('express-validator');
const { validateState } = require('./common');

/**
 * Valid operational status values
 */
const VALID_OPERATIONAL_STATUSES = ['open_normal', 'open_restricted', 'closed', 'pending'];

/**
 * Validate operational_status query parameter
 */
const validateOperationalStatus = query('operational_status')
  .optional()
  .trim()
  .isIn(VALID_OPERATIONAL_STATUSES)
  .withMessage(`operational_status must be one of: ${VALID_OPERATIONAL_STATUSES.join(', ')}`);

/**
 * Validators for GET /api/status/sites
 */
const getSites = [
  validateOperationalStatus,
  validateState
];

module.exports = {
  getSites,
  VALID_OPERATIONAL_STATUSES
};
