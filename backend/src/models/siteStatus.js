/**
 * Site Status Model
 * Data access layer for site_status table
 */

const { getDatabase } = require('../config/database');

const SiteStatusModel = {
  /**
   * Get all site statuses with site information
   * @param {Object} filters - Optional filters (operational_status)
   * @returns {Promise<Array>} Array of site status objects with site data
   */
  async getAll(filters = {}) {
    const db = getDatabase();
    let query = `
      SELECT ss.*, s.site_code, s.name, s.city, s.state, s.region,
             s.latitude, s.longitude
      FROM site_status ss
      JOIN sites s ON ss.site_id = s.id
      WHERE 1=1
    `;
    const params = [];

    if (filters.operational_status) {
      query += ' AND ss.operational_status = ?';
      params.push(filters.operational_status);
    }

    if (filters.state) {
      query += ' AND s.state = ?';
      params.push(filters.state);
    }

    query += ' ORDER BY ss.operational_status, s.state, s.city';

    const [rows] = await db.query(query, params);
    return rows;
  },

  /**
   * Get status for a specific site
   * @param {number} siteId - Site ID
   * @returns {Promise<Object|null>} Site status object or null
   */
  async getBySite(siteId) {
    const db = getDatabase();
    const [rows] = await db.query(`
      SELECT ss.*, s.site_code, s.name, s.city, s.state, s.region
      FROM site_status ss
      JOIN sites s ON ss.site_id = s.id
      WHERE ss.site_id = ?
    `, [siteId]);
    return rows[0] || null;
  },

  /**
   * Get sites by operational status
   * @param {string} status - Operational status ('Open', 'Closed', 'At Risk')
   * @returns {Array} Array of site status objects
   */
  getByStatus(status) {
    return this.getAll({ operational_status: status });
  },

  /**
   * Get impacted sites (Closed or At Risk)
   * @returns {Promise<Array>} Array of impacted site objects
   */
  async getImpacted() {
    const db = getDatabase();
    const [rows] = await db.query(`
      SELECT ss.*, s.site_code, s.name, s.city, s.state, s.region,
             (SELECT COUNT(*) FROM advisories WHERE site_id = ss.site_id AND status = 'active') as advisory_count
      FROM site_status ss
      JOIN sites s ON ss.site_id = s.id
      WHERE ss.operational_status IN ('Closed', 'At Risk')
      ORDER BY ss.operational_status DESC, s.state, s.city
    `);
    return rows;
  },

  /**
   * Update or create site status (now handles both weather impact and operational status)
   * @param {number} siteId - Site ID
   * @param {Object} statusData - Status data object
   * @param {string} statusData.operational_status - Operational status (open_normal, open_restricted, closed, pending)
   * @param {string} statusData.weather_impact_level - Weather impact (green, yellow, orange, red)
   * @param {string} statusData.reason - Legacy reason field
   * @param {string} statusData.decision_by - Who made the operational decision
   * @param {string} statusData.decision_reason - Reason for operational decision
   * @returns {Promise<Object>} Updated site status
   */
  async upsert(siteId, statusData) {
    const db = getDatabase();
    
    // Handle legacy format (string status) for backward compatibility
    if (typeof statusData === 'string') {
      statusData = { operational_status: statusData };
    }
    
    const {
      operational_status,
      weather_impact_level,
      reason,
      decision_by,
      decision_reason
    } = statusData;

    const fields = ['site_id'];
    const values = [siteId];
    const updates = ['last_updated = NOW()'];

    if (operational_status !== undefined) {
      fields.push('operational_status');
      values.push(operational_status);
      updates.push('operational_status = VALUES(operational_status)');
    }

    if (weather_impact_level !== undefined) {
      fields.push('weather_impact_level');
      values.push(weather_impact_level);
      updates.push('weather_impact_level = VALUES(weather_impact_level)');
    }

    if (reason !== undefined) {
      fields.push('reason');
      values.push(reason);
      updates.push('reason = VALUES(reason)');
    }

    if (decision_by !== undefined) {
      fields.push('decision_by');
      values.push(decision_by);
      updates.push('decision_by = VALUES(decision_by)');
      
      // Auto-set decision_at when decision_by is provided
      fields.push('decision_at');
      updates.push('decision_at = NOW()');
    }

    if (decision_reason !== undefined) {
      fields.push('decision_reason');
      values.push(decision_reason);
      updates.push('decision_reason = VALUES(decision_reason)');
    }

    const placeholders = values.map(() => '?').join(', ');
    
    // Add last_updated to field list for INSERT
    const insertFields = [...fields, 'last_updated'];

    await db.query(`
      INSERT INTO site_status (${insertFields.join(', ')})
      VALUES (${placeholders}, NOW())
      ON DUPLICATE KEY UPDATE
        ${updates.join(',\n        ')}
    `, values);

    return this.getBySite(siteId);
  },

  /**
   * Set operational status manually (for IMT/Operations use)
   * @param {number} siteId - Site ID
   * @param {string} operationalStatus - Operational status (open_normal, open_restricted, closed, pending)
   * @param {string} decisionBy - User who made the decision
   * @param {string} decisionReason - Reason for the decision
   * @returns {Promise<Object>} Updated site status
   */
  async setOperationalStatus(siteId, operationalStatus, decisionBy, decisionReason) {
    return this.upsert(siteId, {
      operational_status: operationalStatus,
      decision_by: decisionBy,
      decision_reason: decisionReason
    });
  },

  /**
   * Get status count by operational status
   * @returns {Promise<Array>} Array of {operational_status, count} objects
   */
  async getCountByStatus() {
    const db = getDatabase();
    const [rows] = await db.query(`
      SELECT operational_status, COUNT(*) as count
      FROM site_status
      GROUP BY operational_status
      ORDER BY 
        CASE operational_status
          WHEN 'closed' THEN 1
          WHEN 'open_restricted' THEN 2
          WHEN 'pending' THEN 3
          WHEN 'open_normal' THEN 4
          -- Legacy values
          WHEN 'Closed' THEN 1
          WHEN 'At Risk' THEN 2
          WHEN 'Open' THEN 3
        END
    `);
    return rows;
  },

  /**
   * Get weather impact level counts
   * @returns {Promise<Array>} Array of {weather_impact_level, count} objects
   */
  async getCountByWeatherImpact() {
    const db = getDatabase();
    const [rows] = await db.query(`
      SELECT weather_impact_level, COUNT(*) as count
      FROM site_status
      GROUP BY weather_impact_level
      ORDER BY 
        CASE weather_impact_level
          WHEN 'red' THEN 1
          WHEN 'orange' THEN 2
          WHEN 'yellow' THEN 3
          WHEN 'green' THEN 4
        END
    `);
    return rows;
  },

  /**
   * Bulk update operational status for multiple sites
   * @param {Array<number>} siteIds - Array of site IDs
   * @param {string} operationalStatus - Operational status
   * @param {string} decisionBy - User who made the decision
   * @param {string} decisionReason - Reason for the decision
   * @returns {Promise<number>} Number of sites updated
   */
  async bulkSetOperationalStatus(siteIds, operationalStatus, decisionBy, decisionReason) {
    const db = getDatabase();
    const [result] = await db.query(`
      UPDATE site_status
      SET 
        operational_status = ?,
        decision_by = ?,
        decision_at = NOW(),
        decision_reason = ?,
        last_updated = NOW()
      WHERE site_id IN (?)
    `, [operationalStatus, decisionBy, decisionReason, siteIds]);
    return result.affectedRows;
  },

  /**
   * Get recently updated statuses
   * @param {number} limit - Max number of results
   * @returns {Promise<Array>} Array of recently updated site statuses
   */
  async getRecentlyUpdated(limit = 10) {
    const db = getDatabase();
    const [rows] = await db.query(`
      SELECT ss.*, s.site_code, s.name, s.city, s.state
      FROM site_status ss
      JOIN sites s ON ss.site_id = s.id
      ORDER BY ss.last_updated DESC
      LIMIT ?
    `, [limit]);
    return rows;
  }
};

module.exports = SiteStatusModel;
