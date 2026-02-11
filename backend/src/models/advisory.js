/**
 * Advisory Model - MySQL/MariaDB
 * Data access layer for advisories table
 */

const { getDatabase } = require('../config/database');

const AdvisoryModel = {
  /**
   * Get all advisories with optional filters
   * @param {Object} filters - Optional filters (status, severity, state, site_id)
   * @returns {Promise<Array>} Array of advisory objects with site data
   */
  async getAll(filters = {}) {
    const db = await getDatabase();
    let query = `
      SELECT a.*, s.site_code, s.name as site_name, s.city, s.state, s.region
      FROM advisories a
      JOIN sites s ON a.site_id = s.id
      WHERE 1=1
    `;
    const params = [];

    if (filters.status) {
      query += ' AND a.status = ?';
      params.push(filters.status);
    }

    if (filters.severity) {
      query += ' AND a.severity = ?';
      params.push(filters.severity);
    }

    if (filters.state) {
      query += ' AND s.state = ?';
      params.push(filters.state);
    }

    if (filters.site_id) {
      query += ' AND a.site_id = ?';
      params.push(filters.site_id);
    }

    query += ' ORDER BY a.severity DESC, a.last_updated DESC';

    try {
      const [rows] = await db.query(query, params);
      return rows;
    } catch (error) {
      console.error('Error fetching advisories:', error);
      return [];
    }
  },

  /**
   * Get active advisories only
   * @param {Object} filters - Optional filters
   * @returns {Promise<Array>} Array of active advisory objects
   */
  async getActive(filters = {}) {
    return this.getAll({ ...filters, status: 'active' });
  },

  /**
   * Get advisory by ID
   * @param {number} id - Advisory ID
   * @returns {Promise<Object|null>} Advisory object or null
   */
  async getById(id) {
    const db = await getDatabase();
    try {
      const [rows] = await db.query(`
        SELECT a.*, s.site_code, s.name as site_name, s.city, s.state, s.region
        FROM advisories a
        JOIN sites s ON a.site_id = s.id
        WHERE a.id = ?
      `, [id]);
      return rows[0] || null;
    } catch (error) {
      console.error('Error fetching advisory by ID:', error);
      return null;
    }
  },

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
      console.error('Error fetching advisories for site:', error);
      return [];
    }
  },

  /**
   * Create new advisory
   * @param {Object} advisory - Advisory data
   * @returns {Promise<Object>} Created advisory with ID
   */
  async create(advisory) {
    const db = await getDatabase();
    try {
      const [result] = await db.query(`
        INSERT INTO advisories (
          site_id, advisory_type, severity, status, source,
          headline, description, start_time, end_time, issued_time, raw_payload
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        advisory.site_id,
        advisory.advisory_type,
        advisory.severity,
        advisory.status || 'active',
        advisory.source,
        advisory.headline,
        advisory.description,
        advisory.start_time,
        advisory.end_time,
        advisory.issued_time,
        advisory.raw_payload ? JSON.stringify(advisory.raw_payload) : null
      ]);

      return this.getById(result.insertId);
    } catch (error) {
      console.error('Error creating advisory:', error);
      throw error;
    }
  },

  /**
   * Update advisory
   * @param {number} id - Advisory ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object|null>} Updated advisory or null
   */
  async update(id, updates) {
    const db = await getDatabase();
    const fields = [];
    const params = [];

    for (const [key, value] of Object.entries(updates)) {
      if (key !== 'id' && key !== 'site_id') {
        fields.push(`${key} = ?`);
        params.push(value);
      }
    }

    if (fields.length === 0) return this.getById(id);

    fields.push('last_updated = CURRENT_TIMESTAMP');
    params.push(id);

    const query = `UPDATE advisories SET ${fields.join(', ')} WHERE id = ?`;
    
    try {
      await db.query(query, params);
      return this.getById(id);
    } catch (error) {
      console.error('Error updating advisory:', error);
      return null;
    }
  },

  /**
   * Delete advisory
   * @param {number} id - Advisory ID
   * @returns {Promise<boolean>} Success status
   */
  async delete(id) {
    const db = await getDatabase();
    try {
      const [result] = await db.query('DELETE FROM advisories WHERE id = ?', [id]);
      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error deleting advisory:', error);
      return false;
    }
  },

  /**
   * Get advisory count by severity
   * @param {boolean} activeOnly - Count only active advisories
   * @returns {Promise<Array>} Array of {severity, count} objects
   */
  async getCountBySeverity(activeOnly = true) {
    const db = await getDatabase();
    let query = 'SELECT severity, COUNT(*) as count FROM advisories';
    if (activeOnly) {
      query += " WHERE status = 'active'";
    }
    query += ' GROUP BY severity ORDER BY count DESC';
    
    try {
      const [rows] = await db.query(query);
      return rows;
    } catch (error) {
      console.error('Error counting by severity:', error);
      return [];
    }
  },

  /**
   * Get recently updated advisories
   * @param {number} limit - Max number of results
   * @returns {Promise<Array>} Array of advisory objects
   */
  async getRecentlyUpdated(limit = 10) {
    const db = await getDatabase();
    try {
      const [rows] = await db.query(`
        SELECT a.*, s.site_code, s.name as site_name, s.city, s.state
        FROM advisories a
        JOIN sites s ON a.site_id = s.id
        WHERE a.status = 'active'
        ORDER BY a.last_updated DESC
        LIMIT ?
      `, [limit]);
      return rows;
    } catch (error) {
      console.error('Error fetching recently updated:', error);
      return [];
    }
  },

  /**
   * Mark expired advisories as expired
   * @returns {Promise<number>} Number of advisories marked as expired
   */
  async markExpired() {
    const db = await getDatabase();
    try {
      const [result] = await db.query(`
        UPDATE advisories
        SET status = 'expired', last_updated = CURRENT_TIMESTAMP
        WHERE status = 'active' AND end_time < NOW()
      `);
      return result.affectedRows;
    } catch (error) {
      console.error('Error marking expired advisories:', error);
      return 0;
    }
  }
};

module.exports = AdvisoryModel;
