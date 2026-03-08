/**
 * Site Route Validators
 */

const { validateId, validateState, validateRegion, validateBooleanQuery } = require('./common');

/**
 * Validators for GET /api/sites
 */
const getAll = [
  validateState,
  validateRegion
];

/**
 * Validators for GET /api/sites/:id
 */
const getById = [
  validateId
];

/**
 * Validators for GET /api/sites/:id/advisories
 */
const getOfficeAdvisories = [
  validateId,
  validateBooleanQuery('active_only')
];

module.exports = {
  getAll,
  getById,
  getOfficeAdvisories
};
