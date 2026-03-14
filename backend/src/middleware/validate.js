/**
 * Validation Middleware
 * Handles express-validator errors and returns consistent error responses
 *
 * @generated AI-authored (Claude, Warp) — vanilla JS by design
 */

const { validationResult } = require('express-validator');

/**
 * Middleware to check validation results and return errors
 * Use after express-validator validation chains
 */
function handleValidationErrors(req, res, next) {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        const formattedErrors = errors.array().map((err) => ({
            field: err.path,
            message: err.msg,
            value: err.value
        }));

        return res.status(400).json({
            success: false,
            error: 'Validation failed',
            errors: formattedErrors
        });
    }

    next();
}

module.exports = {
    handleValidationErrors
};
