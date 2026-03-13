/**
 * Notices API Routes
 * Endpoints for government/emergency notices
 */

const express = require('express');
const router = express.Router();
const NoticeModel = require('../models/notice');
const { handleValidationErrors } = require('../middleware/validate');
const noticeValidators = require('../validators/notices');

/**
 * GET /api/notices
 * Get all notices with optional filters
 * Query params: jurisdiction_type, notice_type, state, active_only
 */
router.get('/', noticeValidators.getAll, handleValidationErrors, async (req, res) => {
    try {
        const { jurisdiction_type, notice_type, state, active_only } = req.query;

        let notices;
        if (active_only === 'true') {
            notices = await NoticeModel.getActive({ jurisdiction_type, notice_type, state });
        } else {
            notices = await NoticeModel.getAll({ jurisdiction_type, notice_type, state });
        }

        res.json({ success: true, data: notices, count: notices.length });
    } catch (error) {
        console.error('Error fetching notices:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/notices/active
 * Get active notices only
 * Query params: jurisdiction_type, state
 */
router.get('/active', noticeValidators.getActive, handleValidationErrors, async (req, res) => {
    try {
        const { jurisdiction_type, state } = req.query;
        const notices = await NoticeModel.getActive({ jurisdiction_type, state });
        res.json({ success: true, data: notices, count: notices.length });
    } catch (error) {
        console.error('Error fetching active notices:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/notices/stats
 * Get notice statistics
 */
router.get('/stats', async (req, res) => {
    try {
        const byType = await NoticeModel.getCountByType(true);
        res.json({ success: true, data: { by_type: byType } });
    } catch (error) {
        console.error('Error fetching notice stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/notices/:id
 * Get notice by ID
 */
router.get('/:id', noticeValidators.getById, handleValidationErrors, async (req, res) => {
    try {
        const { id } = req.params;
        const notice = await NoticeModel.getById(id);

        if (!notice) {
            return res.status(404).json({ success: false, error: 'Notice not found' });
        }

        res.json({ success: true, data: notice });
    } catch (error) {
        console.error('Error fetching notice:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
