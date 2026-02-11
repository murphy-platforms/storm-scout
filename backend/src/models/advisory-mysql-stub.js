/**
 * Advisory Model (MySQL Stub)
 * Minimal implementation for MySQL compatibility
 */

const { getDatabase } = require('../config/database');

const AdvisoryModel = {
  /**
   * Get advisories for a specific site
   * @param {number} siteId - Site ID
   * @param {boolean} activeOnly - Get only active advisories
   * @returns {Promise<Array>} Array of advisory objects
   */
  async getBySite(siteId, activeOnly = false) {
    const db = await getDatabase();
    let query = 'SELECT * FROM advisories WHERE site_id = ?';
    const params = [siteId];
    
    if (activeOnly) {
      query += ' AND status = ?';
      params.push('active');
    }
    
    query += ' ORDER BY severity DESC, last_updated DESC';
    
    try {
      const [rows] = await db.query(query, params);
      return rows;
    } catch (error) {
      console.error('Error fetching advisories:', error);
      return [];
    }
  },

  async getActive(filters = {}) {
    try {
      const db = await getDatabase();
      const [rows] = await db.query('SELECT * FROM advisories WHERE status = ?', ['active']);
      return rows;
    } catch (error) {
      console.error('Error fetching active advisories:', error);
      return [];
    }
  },

  async getCountBySeverity(activeOnly = true) {
    try {
      const db = await getDatabase();
      let query = 'SELECT severity, COUNT(*) as count FROM advisories';
      if (activeOnly) {
        query += " WHERE status = 'active'";
      }
      query += ' GROUP BY severity ORDER BY count DESC';
      const [rows] = await db.query(query);
      return rows;
    } catch (error) {
      console.error('Error counting by severity:', error);
      return [];
    }
  }
};

module.exports = AdvisoryModel;
