/**
 * Site Status Model (MySQL Stub)
 * Minimal implementation for MySQL compatibility
 */

const { getDatabase } = require('../config/database');

const SiteStatusModel = {
  /**
   * Get status for a specific site
   * @param {number} siteId - Site ID
   * @returns {Promise<Object|null>} Site status object or null
   */
  async getBySite(siteId) {
    const db = await getDatabase();
    const query = `
      SELECT ss.*, s.site_code, s.name, s.city, s.state, s.region
      FROM site_status ss
      JOIN sites s ON ss.site_id = s.id
      WHERE ss.site_id = ?
    `;
    
    try {
      const [rows] = await db.query(query, [siteId]);
      return rows[0] || null;
    } catch (error) {
      console.error('Error fetching site status:', error);
      return null;
    }
  },

  async getAll(filters = {}) {
    try {
      const db = await getDatabase();
      let query = 'SELECT ss.*, s.site_code, s.name, s.city, s.state, s.region FROM site_status ss JOIN sites s ON ss.site_id = s.id WHERE 1=1';
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
    } catch (error) {
      console.error('Error fetching all site statuses:', error);
      return [];
    }
  },

  async getCountByStatus() {
    try {
      const db = await getDatabase();
      const [rows] = await db.query('SELECT operational_status, COUNT(*) as count FROM site_status GROUP BY operational_status');
      return rows;
    } catch (error) {
      console.error('Error counting by status:', error);
      return [];
    }
  },

  async getRecentlyUpdated(limit = 10) {
    try {
      const db = await getDatabase();
      const [rows] = await db.query(
        'SELECT ss.*, s.site_code, s.name, s.city, s.state FROM site_status ss JOIN sites s ON ss.site_id = s.id ORDER BY ss.last_updated DESC LIMIT ?',
        [limit]
      );
      return rows;
    } catch (error) {
      console.error('Error fetching recently updated:', error);
      return [];
    }
  },

  async getImpacted() {
    try {
      const db = await getDatabase();
      const [rows] = await db.query(
        "SELECT ss.*, s.site_code, s.name, s.city, s.state, s.region FROM site_status ss JOIN sites s ON ss.site_id = s.id WHERE ss.operational_status IN ('Closed', 'At Risk') ORDER BY ss.operational_status DESC, s.state, s.city"
      );
      return rows;
    } catch (error) {
      console.error('Error fetching impacted sites:', error);
      return [];
    }
  }
};

module.exports = SiteStatusModel;
