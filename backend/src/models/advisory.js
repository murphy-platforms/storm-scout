/**
 * Advisory Model
 * Data access layer for advisories table
 */

const { getDatabase } = require('../config/database');

const AdvisoryModel = {
  /**
   * Get all advisories with optional filters
   * @param {Object} filters - Optional filters (status, severity, state, site_id)
   * @returns {Array} Array of advisory objects with site data
   */
  getAll(filters = {}) {
    const db = getDatabase();
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

    return db.prepare(query).all(...params);
  },

  /**
   * Get active advisories only
   * @param {Object} filters - Optional filters
   * @returns {Array} Array of active advisory objects
   */
  getActive(filters = {}) {
    return this.getAll({ ...filters, status: 'active' });
  },

  /**
   * Get advisory by ID
   * @param {number} id - Advisory ID
   * @returns {Object|null} Advisory object or null
   */
  getById(id) {
    const db = getDatabase();
    return db.prepare(`
      SELECT a.*, s.site_code, s.name as site_name, s.city, s.state, s.region
      FROM advisories a
      JOIN sites s ON a.site_id = s.id
      WHERE a.id = ?
    `).get(id);
  },

  /**
   * Get advisories for a specific site
   * @param {number} siteId - Site ID
   * @param {boolean} activeOnly - Get only active advisories
   * @returns {Array} Array of advisory objects
   */
  getBySite(siteId, activeOnly = false) {
    const db = getDatabase();
    let query = 'SELECT * FROM advisories WHERE site_id = ?';
    if (activeOnly) {
      query += ' AND status = \'active\'';
    }
    query += ' ORDER BY severity DESC, last_updated DESC';
    return db.prepare(query).all(siteId);
  },

  /**
   * Create new advisory
   * @param {Object} advisory - Advisory data
   * @returns {Object} Created advisory with ID
   */
  create(advisory) {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO advisories (
        site_id, advisory_type, severity, status, source,
        headline, description, start_time, end_time, issued_time, raw_payload
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
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
    );

    return this.getById(result.lastInsertRowid);
  },

  /**
   * Update advisory
   * @param {number} id - Advisory ID
   * @param {Object} updates - Fields to update
   * @returns {Object|null} Updated advisory or null
   */
  update(id, updates) {
    const db = getDatabase();
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
    db.prepare(query).run(...params);

    return this.getById(id);
  },

  /**
   * Delete advisory
   * @param {number} id - Advisory ID
   * @returns {boolean} Success status
   */
  delete(id) {
    const db = getDatabase();
    const result = db.prepare('DELETE FROM advisories WHERE id = ?').run(id);
    return result.changes > 0;
  },

  /**
   * Get advisory count by severity
   * @param {boolean} activeOnly - Count only active advisories
   * @returns {Array} Array of {severity, count} objects
   */
  getCountBySeverity(activeOnly = true) {
    const db = getDatabase();
    let query = 'SELECT severity, COUNT(*) as count FROM advisories';
    if (activeOnly) {
      query += ' WHERE status = \'active\'';
    }
    query += ' GROUP BY severity ORDER BY count DESC';
    return db.prepare(query).all();
  },

  /**
   * Get recently updated advisories
   * @param {number} limit - Max number of results
   * @returns {Array} Array of advisory objects
   */
  getRecentlyUpdated(limit = 10) {
    const db = getDatabase();
    return db.prepare(`
      SELECT a.*, s.site_code, s.name as site_name, s.city, s.state
      FROM advisories a
      JOIN sites s ON a.site_id = s.id
      WHERE a.status = 'active'
      ORDER BY a.last_updated DESC
      LIMIT ?
    `).all(limit);
  },

  /**
   * Mark expired advisories as expired
   * @returns {number} Number of advisories marked as expired
   */
  markExpired() {
    const db = getDatabase();
    const result = db.prepare(`
      UPDATE advisories
      SET status = 'expired', last_updated = CURRENT_TIMESTAMP
      WHERE status = 'active'
        AND end_time IS NOT NULL
        AND datetime(end_time) < datetime('now')
    `).run();
    return result.changes;
  }
};

module.exports = AdvisoryModel;
