/**
 * Notice Route Validators
 */

const { query } = require('express-validator');
const { validateId, validateState, validateBooleanQuery } = require('./common');

/**
 * Valid jurisdiction types
 */
// Title-Case matches values stored in the notices table (e.g. 'Federal', 'State')
const VALID_JURISDICTIONS = ['Federal', 'State', 'County', 'City'];

/**
 * Validate jurisdiction_type query parameter
 */
const validateJurisdiction = query('jurisdiction_type')
  .optional()
  .trim()
  .isIn(VALID_JURISDICTIONS)
  .withMessage(`jurisdiction_type must be one of: ${VALID_JURISDICTIONS.join(', ')}`);

/**
 * Validate notice_type query parameter
 */
const validateNoticeType = query('notice_type')
  .optional()
  .trim()
  .isLength({ max: 100 })
  .withMessage('notice_type must be at most 100 characters');

/**
 * Validators for GET /api/notices
 */
const getAll = [
  validateJurisdiction,
  validateNoticeType,
  validateState,
  validateBooleanQuery('active_only')
];

/**
 * Validators for GET /api/notices/active
 */
const getActive = [
  validateJurisdiction,
  validateState
];

/**
 * Validators for GET /api/notices/:id
 */
const getById = [
  validateId
];

module.exports = {
  getAll,
  getActive,
  getById,
  VALID_JURISDICTIONS
};
