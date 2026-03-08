const express = require('express');
const router = express.Router();
const AdvisoryHistory = require('../models/advisoryHistory');
const Site = require('../models/office');

/**
 * GET /api/trends
 * Get trends for all sites with history
 */
router.get('/', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 7;
        const trends = await AdvisoryHistory.getAllTrends(days);
        
        // Enhance with site info
        const siteIds = [...new Set(trends.map(t => t.site_id))];
        const sites = await Site.getByIds(siteIds);
        const siteMap = new Map(sites.map(s => [s.id, s]));
        
        const enrichedTrends = trends.map(trend => ({
            ...trend,
            site: siteMap.get(trend.site_id)
        }));
        
        res.json(enrichedTrends);
    } catch (error) {
        console.error('Error fetching trends:', error);
        res.status(500).json({ error: 'Failed to fetch trends' });
    }
});

/**
 * GET /api/trends/:siteId
 * Get trend data for a specific site
 */
router.get('/:siteId', async (req, res) => {
    try {
        const siteId = parseInt(req.params.siteId);
        const days = parseInt(req.query.days) || 7;
        
        const trend = await AdvisoryHistory.getTrend(siteId, days);
        const site = await Site.getById(siteId);
        
        res.json({
            ...trend,
            site
        });
    } catch (error) {
        console.error('Error fetching site trend:', error);
        res.status(500).json({ error: 'Failed to fetch site trend' });
    }
});

/**
 * GET /api/trends/:siteId/history
 * Get full history for a site
 */
router.get('/:siteId/history', async (req, res) => {
    try {
        const siteId = parseInt(req.params.siteId);
        const days = parseInt(req.query.days) || 7;
        
        const history = await AdvisoryHistory.getHistoryForSite(siteId, days);
        const site = await Site.getById(siteId);
        
        res.json({
            site,
            history
        });
    } catch (error) {
        console.error('Error fetching site history:', error);
        res.status(500).json({ error: 'Failed to fetch site history' });
    }
});

module.exports = router;
