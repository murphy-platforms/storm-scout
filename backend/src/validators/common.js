/**
 * Common Validation Rules
 * Reusable validation chains for common parameters
 *
 * @generated AI-authored (Claude, Warp) — vanilla JS by design
 */

const { param, query } = require('express-validator');

/**
 * Validate ID parameter (route param)
 * Must be a positive integer
 */
const validateId = param('id').isInt({ min: 1 }).withMessage('ID must be a positive integer').toInt();

/**
 * Validate state query parameter
 * Must be exactly 2 uppercase letters (US state code)
 */
const validateState = query('state')
    .optional()
    .trim()
    .toUpperCase()
    .isLength({ min: 2, max: 2 })
    .withMessage('State must be a 2-letter code (e.g., CA, TX)')
    .isAlpha()
    .withMessage('State must contain only letters');

/**
 * Validate limit query parameter
 * Must be an integer between 1 and 100
 */
const validateLimit = query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
    .toInt();

/**
 * Validate days query parameter
 * Must be an integer between 1 and 30
 */
const validateDays = query('days')
    .optional()
    .isInt({ min: 1, max: 30 })
    .withMessage('Days must be between 1 and 30')
    .toInt();

/**
 * Validate hours query parameter
 * Must be an integer between 1 and 168 (1 week)
 */
const validateHours = query('hours')
    .optional()
    .isInt({ min: 1, max: 168 })
    .withMessage('Hours must be between 1 and 168')
    .toInt();

/**
 * Validate boolean query parameter (active_only, etc.)
 */
const validateBooleanQuery = (fieldName) =>
    query(fieldName).optional().isIn(['true', 'false']).withMessage(`${fieldName} must be 'true' or 'false'`);

/**
 * Validate office_id query parameter
 */
const validateOfficeId = query('office_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('office_id must be a positive integer')
    .toInt();

/**
 * Validate region query parameter
 */
const validateRegion = query('region')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Region must be at most 50 characters');

module.exports = {
    validateId,
    validateState,
    validateLimit,
    validateDays,
    validateHours,
    validateBooleanQuery,
    validateOfficeId,
    validateRegion
};
