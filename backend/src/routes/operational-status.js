/**
 * Operational Status API Routes
 * Endpoints to manually manage office operational status
 *
 * @generated AI-authored (Claude, Warp) — vanilla JS by design
 */

const express = require('express');
const router = express.Router();
const OfficeStatusModel = require('../models/officeStatus');
const OfficeModel = require('../models/office');

/**
 * POST /api/operational-status/offices/:id
 * Set operational status for a specific office
 *
 * STATUS: DISABLED - Returns 501 Not Implemented
 * REASON: Manual status override feature planned for future release.
 *         Status is currently calculated automatically from weather data.
 * SECURITY: Endpoint disabled to prevent unauthorized modifications (Issue #1)
 */
router.post('/offices/:id', (req, res) => {
    res.status(501).json({
        success: false,
        error: 'Manual status updates not yet implemented',
        message:
            'Operational status is currently calculated automatically from weather advisory data. Manual override feature is planned for a future release.',
        feature_status: 'planned'
    });
});

/**
 * POST /api/operational-status/bulk-update
 * Bulk update operational status for multiple offices
 *
 * STATUS: DISABLED - Returns 501 Not Implemented
 * REASON: Manual status override feature planned for future release.
 * SECURITY: Endpoint disabled to prevent unauthorized modifications (Issue #1)
 */
router.post('/bulk-update', (req, res) => {
    res.status(501).json({
        success: false,
        error: 'Bulk status updates not yet implemented',
        message:
            'Operational status is currently calculated automatically from weather advisory data. Manual bulk override feature is planned for a future release.',
        feature_status: 'planned'
    });
});

/**
 * GET /api/operational-status/offices/:id
 * Get current operational status for an office including decision history
 */
router.get('/offices/:id', async (req, res) => {
    try {
        const officeId = parseInt(req.params.id, 10);

        const status = await OfficeStatusModel.getByOffice(officeId);

        if (!status) {
            return res.status(404).json({
                success: false,
                error: `Status not found for office ${officeId}`
            });
        }

        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        console.error('Error fetching operational status:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/operational-status/summary
 * Get summary of operational status counts by weather impact level
 * Useful for dashboard showing which offices need decisions
 */
router.get('/summary', async (req, res) => {
    try {
        const { getDatabase } = require('../config/database');
        const db = getDatabase();

        // Get counts by weather impact and operational status
        const [summary] = await db.query(`
      SELECT
        ss.weather_impact_level,
        ss.operational_status,
        COUNT(*) as count
      FROM office_status ss
      GROUP BY ss.weather_impact_level, ss.operational_status
      ORDER BY
        CASE ss.weather_impact_level
          WHEN 'red' THEN 1
          WHEN 'orange' THEN 2
          WHEN 'yellow' THEN 3
          WHEN 'green' THEN 4
        END,
        CASE ss.operational_status
          WHEN 'closed' THEN 1
          WHEN 'open_restricted' THEN 2
          WHEN 'pending' THEN 3
          WHEN 'open_normal' THEN 4
        END
    `);

        // Get offices that need attention (high impact but not closed/restricted)
        // NOTE: decision_by should contain role identifiers (e.g., 'ops_team'),
        // not personal names, to avoid exposing PII via the API.
        const [needsAttention] = await db.query(`
      SELECT s.id, s.office_code, s.name, s.state,
             ss.weather_impact_level, ss.operational_status,
             ss.decision_by, ss.decision_at,
             COUNT(a.id) as advisory_count
      FROM office_status ss
      JOIN offices s ON ss.office_id = s.id
      LEFT JOIN advisories a ON a.office_id = s.id AND a.status = 'active'
      WHERE ss.weather_impact_level IN ('red', 'orange')
        AND ss.operational_status IN ('open_normal', 'pending')
      GROUP BY s.id
      ORDER BY
        CASE ss.weather_impact_level WHEN 'red' THEN 1 ELSE 2 END,
        ss.operational_status,
        s.state, s.name
    `);

        res.json({
            success: true,
            data: {
                summary,
                needs_attention: needsAttention,
                needs_attention_count: needsAttention.length
            }
        });
    } catch (error) {
        console.error('Error fetching operational status summary:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
