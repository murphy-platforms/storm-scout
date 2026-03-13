/**
 * Advisories API Routes
 * Endpoints for weather advisories
 */

const express = require('express');
const router = express.Router();
const AdvisoryModel = require('../models/advisory');
const cache = require('../utils/cache');
const { handleValidationErrors } = require('../middleware/validate');
const advisoryValidators = require('../validators/advisories');

/**
 * GET /api/advisories
 * Get all advisories with optional filters
 * Query params: status, severity (comma-separated), state, office_id, advisory_type (comma-separated)
 * Example: /api/advisories?severity=Extreme,Severe&state=CA
 */
router.get('/', advisoryValidators.getAll, handleValidationErrors, async (req, res) => {
    try {
        const { status, severity, state, office_id, advisory_type } = req.query;
        const advisories = await AdvisoryModel.getAll({ status, severity, state, office_id, advisory_type });
        res.json({ success: true, data: advisories, count: advisories.length });
    } catch (error) {
        console.error('Error fetching advisories:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/advisories/active
 * Get all active advisories with optional filters
 * Query params: severity (comma-separated), state, advisory_type (comma-separated)
 * Example: /api/advisories/active?severity=Extreme,Severe
 */
router.get('/active', advisoryValidators.getActive, handleValidationErrors, async (req, res, next) => {
    try {
        const { severity, state, advisory_type } = req.query;
        const hasFilters = severity || state || advisory_type;

        // Build a stable, deterministic cache key.
        // Filtered requests use a composite key sorted by param name so that
        // ?severity=Extreme&state=FL and ?state=FL&severity=Extreme hit the same entry.
        // Paginated requests bypass the cache entirely (see pagination block below).
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(200, parseInt(req.query.limit) || 0); // 0 = return all (default)
        const hasPagination = limit > 0;

        let cacheKey;
        if (!hasFilters) {
            cacheKey = cache.CACHE_KEYS.ACTIVE_ADVISORIES;
        } else {
            const sortedParams = JSON.stringify(
                Object.fromEntries(
                    Object.entries({ severity, state, advisory_type })
                        .filter(([, v]) => v !== undefined)
                        .sort(([a], [b]) => a.localeCompare(b))
                )
            );
            cacheKey = `advisories:filtered:${sortedParams}`;
        }

        // Paginated requests bypass the cache to prevent a partial dataset being
        // stored under or returned from a full-dataset key.
        if (!hasPagination) {
            const cached = cache.get(cacheKey);
            if (cached) return res.json(cached);
        }

        const advisories = await AdvisoryModel.getActive({ severity, state, advisory_type });

        // Paginated response — not cached server-side
        if (hasPagination) {
            const total = advisories.length;
            const pages = Math.ceil(total / limit);
            const slice = advisories.slice((page - 1) * limit, page * limit);
            return res.json({ success: true, data: slice, count: slice.length, total, pages, page, limit });
        }

        // Non-paginated response — cache it.
        // Filtered results use a 5-min TTL (shorter than the 15-min ingestion interval).
        // Unfiltered results use the standard 15-min TTL.
        const response = { success: true, data: advisories, count: advisories.length };
        cache.set(cacheKey, response, hasFilters ? 300 : cache.TTL.SHORT);
        res.json(response);
    } catch (error) {
        if (error.isPoolExhausted) return next(error); // → 503 handler
        console.error('Error fetching active advisories:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/advisories/recent
 * Get recently updated advisories
 * Query params: limit (default 10)
 */
router.get('/recent', advisoryValidators.getRecent, handleValidationErrors, async (req, res) => {
    try {
        const limit = req.query.limit || 10;
        const advisories = await AdvisoryModel.getRecentlyUpdated(limit);
        res.json({ success: true, data: advisories });
    } catch (error) {
        console.error('Error fetching recent advisories:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/advisories/stats
 * Get advisory statistics
 */
router.get('/stats', async (req, res) => {
    try {
        const bySeverity = await AdvisoryModel.getCountBySeverity(true);
        res.json({ success: true, data: { by_severity: bySeverity } });
    } catch (error) {
        console.error('Error fetching advisory stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/advisories/:id
 * Get advisory by ID
 */
router.get('/:id', advisoryValidators.getById, handleValidationErrors, async (req, res) => {
    try {
        const { id } = req.params;
        const advisory = await AdvisoryModel.getById(id);

        if (!advisory) {
            return res.status(404).json({ success: false, error: 'Advisory not found' });
        }

        res.json({ success: true, data: advisory });
    } catch (error) {
        console.error('Error fetching advisory:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
