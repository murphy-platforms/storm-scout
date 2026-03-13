/**
 * Advisory Route Validators
 */

const { query } = require('express-validator');
const { validateId, validateState, validateLimit, validateOfficeId } = require('./common');
const { NOAA_ALERT_TYPES } = require('../config/noaa-alert-types');

// Flat Set of all known NOAA alert type strings built once at module load.
// Used to whitelist advisory_type query param values. (closes #96)
// Note: the ingestor auto-registers unknown NOAA types internally via
// INSERT IGNORE into alert_types — this whitelist guards API query params only.
const VALID_ADVISORY_TYPES = new Set(Object.values(NOAA_ALERT_TYPES).flat());

/**
 * Valid severity values
 */
const VALID_SEVERITIES = ['Extreme', 'Severe', 'Moderate', 'Minor'];

/**
 * Valid status values
 */
const VALID_STATUSES = ['active', 'expired'];

/**
 * Validate severity query parameter
 * Supports comma-separated values
 */
const validateSeverity = query('severity')
    .optional()
    .trim()
    .custom((value) => {
        if (!value) return true;
        const severities = value.split(',').map((s) => s.trim());
        for (const sev of severities) {
            if (!VALID_SEVERITIES.includes(sev)) {
                throw new Error(`Invalid severity: ${sev}. Must be one of: ${VALID_SEVERITIES.join(', ')}`);
            }
        }
        return true;
    });

/**
 * Validate status query parameter
 */
const validateStatus = query('status')
    .optional()
    .trim()
    .isIn(VALID_STATUSES)
    .withMessage(`Status must be one of: ${VALID_STATUSES.join(', ')}`);

/**
 * Validate advisory_type query parameter
 * Supports comma-separated values; each value must be a known NOAA alert type.
 */
const validateAdvisoryType = query('advisory_type')
    .optional()
    .trim()
    .custom((value) => {
        if (!value) return true;
        const types = value
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean);
        for (const t of types) {
            if (!VALID_ADVISORY_TYPES.has(t)) {
                throw new Error(`Invalid advisory_type: "${t}". Must be a known NOAA alert type.`);
            }
        }
        return true;
    });

/**
 * Validators for GET /api/advisories
 */
const getAll = [validateStatus, validateSeverity, validateState, validateOfficeId, validateAdvisoryType];

/**
 * Validators for GET /api/advisories/active
 */
const getActive = [validateSeverity, validateState, validateAdvisoryType];

/**
 * Validators for GET /api/advisories/recent
 */
const getRecent = [validateLimit];

/**
 * Validators for GET /api/advisories/:id
 */
const getById = [validateId];

module.exports = {
    getAll,
    getActive,
    getRecent,
    getById,
    VALID_SEVERITIES,
    VALID_STATUSES
};
