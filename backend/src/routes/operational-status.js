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
 * Body: { operational_status, decision_by, decision_reason }
 */
router.post('/sites/:id', async (req, res) => {
  try {
    const siteId = parseInt(req.params.id, 10);
    const { operational_status, decision_by, decision_reason } = req.body;
    
    // Validate inputs
    if (!operational_status) {
      return res.status(400).json({ 
        success: false, 
        error: 'operational_status is required' 
      });
    }
    
    const validStatuses = ['open_normal', 'open_restricted', 'closed', 'pending'];
    if (!validStatuses.includes(operational_status)) {
      return res.status(400).json({ 
        success: false, 
        error: `operational_status must be one of: ${validStatuses.join(', ')}` 
      });
    }
    
    if (!decision_by) {
      return res.status(400).json({ 
        success: false, 
        error: 'decision_by is required (who made this decision)' 
      });
    }
    
    if (!decision_reason) {
      return res.status(400).json({ 
        success: false, 
        error: 'decision_reason is required' 
      });
    }
    
    // Verify site exists
    const site = await SiteModel.getById(siteId);
    if (!site) {
      return res.status(404).json({ 
        success: false, 
        error: `Site ${siteId} not found` 
      });
    }
    
    // Update operational status
    const updatedStatus = await SiteStatusModel.setOperationalStatus(
      siteId,
      operational_status,
      decision_by,
      decision_reason
    );
    
    res.json({ 
      success: true, 
      data: updatedStatus,
      message: `Site ${site.site_code} operational status set to ${operational_status}`
    });
    
  } catch (error) {
    console.error('Error setting operational status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/operational-status/bulk-update
 * Update operational status for multiple sites at once
 * Body: { site_ids: [1, 2, 3], operational_status, decision_by, decision_reason }
 */
router.post('/bulk-update', async (req, res) => {
  try {
    const { site_ids, operational_status, decision_by, decision_reason } = req.body;
    
    // Validate inputs
    if (!site_ids || !Array.isArray(site_ids) || site_ids.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'site_ids must be a non-empty array' 
      });
    }
    
    if (!operational_status) {
      return res.status(400).json({ 
        success: false, 
        error: 'operational_status is required' 
      });
    }
    
    const validStatuses = ['open_normal', 'open_restricted', 'closed', 'pending'];
    if (!validStatuses.includes(operational_status)) {
      return res.status(400).json({ 
        success: false, 
        error: `operational_status must be one of: ${validStatuses.join(', ')}` 
      });
    }
    
    if (!decision_by) {
      return res.status(400).json({ 
        success: false, 
        error: 'decision_by is required (who made this decision)' 
      });
    }
    
    if (!decision_reason) {
      return res.status(400).json({ 
        success: false, 
        error: 'decision_reason is required' 
      });
    }
    
    // Update all sites
    const affectedRows = await SiteStatusModel.bulkSetOperationalStatus(
      site_ids,
      operational_status,
      decision_by,
      decision_reason
    );
    
    res.json({ 
      success: true, 
      data: {
        sites_updated: affectedRows,
        operational_status,
        decision_by
      },
      message: `Updated operational status for ${affectedRows} site(s)`
    });
    
  } catch (error) {
    console.error('Error bulk updating operational status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
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
