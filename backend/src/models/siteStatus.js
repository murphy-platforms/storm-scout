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
   * Update or create site status
   * @param {number} siteId - Site ID
   * @param {string} status - Operational status
   * @param {string} reason - Reason for status
   * @returns {Promise<Object>} Updated site status
   */
  async upsert(siteId, status, reason = null) {
    const db = getDatabase();
    await db.query(`
      INSERT INTO site_status (site_id, operational_status, reason, last_updated)
      VALUES (?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        operational_status = VALUES(operational_status),
        reason = VALUES(reason),
        last_updated = NOW()
    `, [siteId, status, reason]);

    return this.getBySite(siteId);
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
          WHEN 'Closed' THEN 1
          WHEN 'At Risk' THEN 2
          WHEN 'Open' THEN 3
        END
    `);
    return rows;
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
