const express = require('express');
const router = express.Router();
const AdvisoryHistory = require('../models/advisoryHistory');
const Office = require('../models/office');

/**
 * GET /api/trends
 *
 * Return trend summaries for all offices that have advisory history within
 * the requested lookback window.
 *
 * Query parameters:
 *   days {number} - Lookback window in days (default: 7). Controls how far back
 *                   snapshot_time is scanned. Larger values reveal longer-term
 *                   trends but increase query cost. See AdvisoryHistory.getAllTrends
 *                   for the single-query optimisation that makes this efficient
 *                   at 300 offices.
 *
 * Office enrichment:
 *   Trend rows from advisory_history contain only office_id. After fetching
 *   trends, all unique office IDs are resolved in a single batch query
 *   (Office.getByIds) and merged into each trend object so callers receive
 *   the full office metadata (name, city, state, etc.) alongside the trend data.
 *
 * Response shape (array):
 * ```json
 * [
 *   {
 *     "office_id": 42,
 *     "trend": "increasing",
 *     "first_severity": "Minor",
 *     "last_severity": "Severe",
 *     "first_count": 1,
 *     "last_count": 4,
 *     "duration_hours": 168,
 *     "history": [...],
 *     "office": { "id": 42, "office_code": "12345", "name": "...", ... }
 *   }
 * ]
 * ```
 */
router.get('/', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 7;
        const trends = await AdvisoryHistory.getAllTrends(days);

        // Office enrichment: resolve all referenced office IDs in one batch query
        // rather than N individual lookups. The resulting Map provides O(1) access
        // when merging office metadata into each trend object.
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
 *
 * Return a trend summary for a single office, including the first-vs-last
 * severity comparison and advisory count delta.
 *
 * Route parameters:
 *   officeId {number} - Internal office ID (offices.id, not the zip code)
 *
 * Query parameters:
 *   days {number} - Lookback window in days (default: 7)
 *
 * Response shape:
 * ```json
 * {
 *   "trend": "worsening",
 *   "severity_change": 2,
 *   "advisory_change": 3,
 *   "first_severity": "Minor",
 *   "last_severity": "Severe",
 *   "first_count": 1,
 *   "last_count": 4,
 *   "duration_hours": 48,
 *   "history": [...],
 *   "office": { "id": 42, "office_code": "12345", "name": "...", ... }
 * }
 * ```
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
 *
 * Return the raw advisory_history rows for a single office within the
 * lookback window, alongside the office metadata. Intended for chart rendering
 * or detailed timeline views that need the full snapshot series rather than
 * just the first/last summary.
 *
 * Route parameters:
 *   officeId {number} - Internal office ID (offices.id)
 *
 * Query parameters:
 *   days {number} - Lookback window in days (default: 7)
 *
 * Response shape:
 * ```json
 * {
 *   "office": { "id": 42, "office_code": "12345", "name": "...", ... },
 *   "history": [
 *     {
 *       "id": 1,
 *       "office_id": 42,
 *       "snapshot_time": "2026-03-03T06:00:00.000Z",
 *       "advisory_count": 2,
 *       "highest_severity": "Moderate",
 *       ...
 *     }
 *   ]
 * }
 * ```
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
