const express = require('express');
const router = express.Router();
const AdvisoryHistory = require('../models/advisoryHistory');
const Office = require('../models/office');

/**
 * GET /api/trends
 * Get trends for all offices with history
 */
router.get('/', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 7;
        const trends = await AdvisoryHistory.getAllTrends(days);

        // Enhance with office info
        const officeIds = [...new Set(trends.map(t => t.office_id))];
        const offices = await Office.getByIds(officeIds);
        const officeMap = new Map(offices.map(o => [o.id, o]));

        const enrichedTrends = trends.map(trend => ({
            ...trend,
            office: officeMap.get(trend.office_id)
        }));

        res.json(enrichedTrends);
    } catch (error) {
        console.error('Error fetching trends:', error);
        res.status(500).json({ error: 'Failed to fetch trends' });
    }
});

/**
 * GET /api/trends/:officeId
 * Get trend data for a specific office
 */
router.get('/:officeId', async (req, res) => {
    try {
        const officeId = parseInt(req.params.officeId);
        const days = parseInt(req.query.days) || 7;

        const trend = await AdvisoryHistory.getTrend(officeId, days);
        const office = await Office.getById(officeId);

        res.json({
            ...trend,
            office
        });
    } catch (error) {
        console.error('Error fetching office trend:', error);
        res.status(500).json({ error: 'Failed to fetch office trend' });
    }
});

/**
 * GET /api/trends/:officeId/history
 * Get full history for an office
 */
router.get('/:officeId/history', async (req, res) => {
    try {
        const officeId = parseInt(req.params.officeId);
        const days = parseInt(req.query.days) || 7;

        const history = await AdvisoryHistory.getHistoryForSite(officeId, days);
        const office = await Office.getById(officeId);

        res.json({
            office,
            history
        });
    } catch (error) {
        console.error('Error fetching office history:', error);
        res.status(500).json({ error: 'Failed to fetch office history' });
    }
});

module.exports = router;
