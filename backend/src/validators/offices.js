/**
 * Office Route Validators
 *
 * @generated AI-authored (Claude, Warp) — vanilla JS by design
 */

const { validateId, validateState, validateRegion, validateBooleanQuery } = require('./common');

/**
 * Validators for GET /api/offices
 */
const getAll = [validateState, validateRegion];

/**
 * Validators for GET /api/offices/:id
 */
const getById = [validateId];

/**
 * Validators for GET /api/offices/:id/advisories
 */
const getOfficeAdvisories = [validateId, validateBooleanQuery('active_only')];

module.exports = {
    getAll,
    getById,
    getOfficeAdvisories
};
