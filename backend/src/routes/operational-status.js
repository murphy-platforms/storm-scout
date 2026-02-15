/**
 * Operational Status API Routes
 * Endpoints for IMT/Operations to manually manage site operational status
 * Co-Authored-By: Warp <agent@warp.dev>
 */

const express = require('express');
const router = express.Router();
const SiteStatusModel = require('../models/siteStatus');
const SiteModel = require('../models/site');

/**
 * POST /api/operational-status/sites/:id
 * Set operational status for a specific site
 * 
 * STATUS: DISABLED - Returns 501 Not Implemented
 * REASON: Manual status override feature planned for future release.
 *         Status is currently calculated automatically from weather data.
 * SECURITY: Endpoint disabled to prevent unauthorized modifications (Issue #1)
 */
router.post('/sites/:id', (req, res) => {
  res.status(501).json({
    success: false,
    error: 'Manual status updates not yet implemented',
    message: 'Operational status is currently calculated automatically from weather advisory data. Manual override feature is planned for a future release.',
    feature_status: 'planned',
    documentation: 'https://github.com/Prometric-Site-Engineering/storm-scout/issues/1'
  });
});

/**
 * POST /api/operational-status/bulk-update
 * Bulk update operational status for multiple sites
 * 
 * STATUS: DISABLED - Returns 501 Not Implemented
 * REASON: Manual status override feature planned for future release.
 * SECURITY: Endpoint disabled to prevent unauthorized modifications (Issue #1)
 */
router.post('/bulk-update', (req, res) => {
  res.status(501).json({
    success: false,
    error: 'Bulk status updates not yet implemented',
    message: 'Operational status is currently calculated automatically from weather advisory data. Manual bulk override feature is planned for a future release.',
    feature_status: 'planned',
    documentation: 'https://github.com/Prometric-Site-Engineering/storm-scout/issues/1'
  });
});

/**
 * GET /api/operational-status/sites/:id
 * Get current operational status for a site including decision history
 */
router.get('/sites/:id', async (req, res) => {
  try {
    const siteId = parseInt(req.params.id, 10);
    
    const status = await SiteStatusModel.getBySite(siteId);
    
    if (!status) {
      return res.status(404).json({ 
        success: false, 
        error: `Status not found for site ${siteId}` 
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
 * Useful for IMT dashboard showing which sites need decisions
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
      FROM site_status ss
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
    
    // Get sites that need attention (high impact but not closed/restricted)
    const [needsAttention] = await db.query(`
      SELECT s.id, s.site_code, s.name, s.state,
             ss.weather_impact_level, ss.operational_status,
             ss.decision_by, ss.decision_at,
             COUNT(a.id) as advisory_count
      FROM site_status ss
      JOIN sites s ON ss.site_id = s.id
      LEFT JOIN advisories a ON a.site_id = s.id AND a.status = 'active'
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
