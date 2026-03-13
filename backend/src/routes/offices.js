/**
 * Offices API Routes
 * Endpoints for office data
 */

const express = require('express');
const router = express.Router();
const OfficeModel = require('../models/office');
const AdvisoryModel = require('../models/advisory');
const OfficeStatusModel = require('../models/officeStatus');
const cache = require('../utils/cache');
const { handleValidationErrors } = require('../middleware/validate');
const officeValidators = require('../validators/offices');

/**
 * GET /api/offices
 * Get all offices with optional filters
 * Query params: state, region
 */
router.get('/', officeValidators.getAll, handleValidationErrors, async (req, res) => {
    try {
        const { state, region } = req.query;

        // Only cache requests with no filters (all offices)
        const hasFilters = state || region;

        if (!hasFilters) {
            const cached = cache.get(cache.CACHE_KEYS.ALL_OFFICES);
            if (cached) {
                return res.json(cached);
            }
        }

        const offices = await OfficeModel.getAll({ state, region });

        const response = { success: true, data: offices, count: offices.length };

        // Cache only unfiltered requests (longer TTL for static office data)
        if (!hasFilters) {
            cache.set(cache.CACHE_KEYS.ALL_OFFICES, response, cache.TTL.LONG);
        }

        res.json(response);
    } catch (error) {
        console.error('Error fetching offices:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/offices/states
 * Get list of all states with offices
 */
router.get('/states', async (req, res) => {
    try {
        const cached = cache.get(cache.CACHE_KEYS.STATES_LIST);
        if (cached) {
            return res.json(cached);
        }

        const states = await OfficeModel.getStates();
        const response = { success: true, data: states };

        cache.set(cache.CACHE_KEYS.STATES_LIST, response, cache.TTL.VERY_LONG);

        res.json(response);
    } catch (error) {
        console.error('Error fetching states:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/offices/regions
 * Get list of all regions
 */
router.get('/regions', async (req, res) => {
    try {
        const cached = cache.get(cache.CACHE_KEYS.REGIONS_LIST);
        if (cached) {
            return res.json(cached);
        }

        const regions = await OfficeModel.getRegions();
        const response = { success: true, data: regions };

        cache.set(cache.CACHE_KEYS.REGIONS_LIST, response, cache.TTL.VERY_LONG);

        res.json(response);
    } catch (error) {
        console.error('Error fetching regions:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/offices/:id
 * Get office by ID with status and advisories
 */
router.get('/:id', officeValidators.getById, handleValidationErrors, async (req, res) => {
    try {
        const { id } = req.params;
        const office = await OfficeModel.getById(id);

        if (!office) {
            return res.status(404).json({ success: false, error: 'Office not found' });
        }

        const status = await OfficeStatusModel.getByOffice(id);
        const advisories = await AdvisoryModel.getByOffice(id, true); // Active only

        res.json({
            success: true,
            data: {
                ...office,
                status: status || { operational_status: 'Open', reason: null },
                active_advisories: advisories
            }
        });
    } catch (error) {
        console.error('Error fetching office:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/offices/:id/advisories
 * Get all advisories for a specific office
 * Query params: active_only (boolean)
 */
router.get('/:id/advisories', officeValidators.getOfficeAdvisories, handleValidationErrors, async (req, res) => {
    try {
        const { id } = req.params;
        const activeOnly = req.query.active_only === 'true';

        const office = await OfficeModel.getById(id);
        if (!office) {
            return res.status(404).json({ success: false, error: 'Office not found' });
        }

        const advisories = await AdvisoryModel.getByOffice(id, activeOnly);
        res.json({ success: true, data: advisories, count: advisories.length });
    } catch (error) {
        console.error('Error fetching office advisories:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
