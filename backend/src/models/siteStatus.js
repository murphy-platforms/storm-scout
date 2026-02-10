/**
 * Site Status Model
 * Data access layer for site_status table
 */

const { getDatabase } = require('../config/database');

const SiteStatusModel = {
  /**
   * Get all site statuses with site information
   * @param {Object} filters - Optional filters (operational_status)
   * @returns {Array} Array of site status objects with site data
   */
  getAll(filters = {}) {
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

    return db.prepare(query).all(...params);
  },

  /**
   * Get status for a specific site
   * @param {number} siteId - Site ID
   * @returns {Object|null} Site status object or null
   */
  getBySite(siteId) {
    const db = getDatabase();
    return db.prepare(`
      SELECT ss.*, s.site_code, s.name, s.city, s.state, s.region
      FROM site_status ss
      JOIN sites s ON ss.site_id = s.id
      WHERE ss.site_id = ?
    `).get(siteId);
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
   * @returns {Array} Array of impacted site objects
   */
  getImpacted() {
    const db = getDatabase();
    return db.prepare(`
      SELECT ss.*, s.site_code, s.name, s.city, s.state, s.region,
             (SELECT COUNT(*) FROM advisories WHERE site_id = ss.site_id AND status = 'active') as advisory_count
      FROM site_status ss
      JOIN sites s ON ss.site_id = s.id
      WHERE ss.operational_status IN ('Closed', 'At Risk')
      ORDER BY ss.operational_status DESC, s.state, s.city
    `).all();
  },

  /**
   * Update or create site status
   * @param {number} siteId - Site ID
   * @param {string} status - Operational status
   * @param {string} reason - Reason for status
   * @returns {Object} Updated site status
   */
  upsert(siteId, status, reason = null) {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO site_status (site_id, operational_status, reason, last_updated)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(site_id) DO UPDATE SET
        operational_status = excluded.operational_status,
        reason = excluded.reason,
        last_updated = CURRENT_TIMESTAMP
    `);

    stmt.run(siteId, status, reason);
    return this.getBySite(siteId);
  },

  /**
   * Get status count by operational status
   * @returns {Array} Array of {operational_status, count} objects
   */
  getCountByStatus() {
    const db = getDatabase();
    return db.prepare(`
      SELECT operational_status, COUNT(*) as count
      FROM site_status
      GROUP BY operational_status
      ORDER BY 
        CASE operational_status
          WHEN 'Closed' THEN 1
          WHEN 'At Risk' THEN 2
          WHEN 'Open' THEN 3
        END
    `).all();
  },

  /**
   * Get recently updated statuses
   * @param {number} limit - Max number of results
   * @returns {Array} Array of recently updated site statuses
   */
  getRecentlyUpdated(limit = 10) {
    const db = getDatabase();
    return db.prepare(`
      SELECT ss.*, s.site_code, s.name, s.city, s.state
      FROM site_status ss
      JOIN sites s ON ss.site_id = s.id
      ORDER BY ss.last_updated DESC
      LIMIT ?
    `).all(limit);
  }
};

module.exports = SiteStatusModel;
