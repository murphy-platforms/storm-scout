/**
 * Notice Model
 * Data access layer for notices table (government/emergency notices)
 */

const { getDatabase } = require('../config/database');

const NoticeModel = {
  /**
   * Get all notices with optional filters
   * @param {Object} filters - Optional filters (jurisdiction_type, notice_type, state)
   * @returns {Array} Array of notice objects
   */
  getAll(filters = {}) {
    const db = getDatabase();
    let query = 'SELECT * FROM notices WHERE 1=1';
    const params = [];

    if (filters.jurisdiction_type) {
      query += ' AND jurisdiction_type = ?';
      params.push(filters.jurisdiction_type);
    }

    if (filters.notice_type) {
      query += ' AND notice_type = ?';
      params.push(filters.notice_type);
    }

    if (filters.state) {
      query += ' AND (affected_states LIKE ? OR affected_states LIKE ? OR affected_states LIKE ?)';
      params.push(`${filters.state},%`, `%,${filters.state},%`, `%,${filters.state}`);
    }

    query += ' ORDER BY effective_time DESC';

    return db.prepare(query).all(...params);
  },

  /**
   * Get active notices (not expired)
   * @param {Object} filters - Optional filters
   * @returns {Array} Array of active notice objects
   */
  getActive(filters = {}) {
    const db = getDatabase();
    let query = `
      SELECT * FROM notices
      WHERE (expiration_time IS NULL OR datetime(expiration_time) > datetime('now'))
    `;
    const params = [];

    if (filters.jurisdiction_type) {
      query += ' AND jurisdiction_type = ?';
      params.push(filters.jurisdiction_type);
    }

    if (filters.state) {
      query += ' AND (affected_states LIKE ? OR affected_states LIKE ? OR affected_states LIKE ?)';
      params.push(`${filters.state},%`, `%,${filters.state},%`, `%,${filters.state}`);
    }

    query += ' ORDER BY effective_time DESC';

    return db.prepare(query).all(...params);
  },

  /**
   * Get notice by ID
   * @param {number} id - Notice ID
   * @returns {Object|null} Notice object or null
   */
  getById(id) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM notices WHERE id = ?').get(id);
  },

  /**
   * Create new notice
   * @param {Object} notice - Notice data
   * @returns {Object} Created notice with ID
   */
  create(notice) {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO notices (
        jurisdiction, jurisdiction_type, notice_type, title, description,
        affected_states, effective_time, expiration_time, source_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      notice.jurisdiction,
      notice.jurisdiction_type,
      notice.notice_type,
      notice.title,
      notice.description,
      notice.affected_states,
      notice.effective_time,
      notice.expiration_time,
      notice.source_url
    );

    return this.getById(result.lastInsertRowid);
  },

  /**
   * Update notice
   * @param {number} id - Notice ID
   * @param {Object} updates - Fields to update
   * @returns {Object|null} Updated notice or null
   */
  update(id, updates) {
    const db = getDatabase();
    const fields = [];
    const params = [];

    for (const [key, value] of Object.entries(updates)) {
      if (key !== 'id') {
        fields.push(`${key} = ?`);
        params.push(value);
      }
    }

    if (fields.length === 0) return this.getById(id);

    fields.push('last_updated = CURRENT_TIMESTAMP');
    params.push(id);

    const query = `UPDATE notices SET ${fields.join(', ')} WHERE id = ?`;
    db.prepare(query).run(...params);

    return this.getById(id);
  },

  /**
   * Delete notice
   * @param {number} id - Notice ID
   * @returns {boolean} Success status
   */
  delete(id) {
    const db = getDatabase();
    const result = db.prepare('DELETE FROM notices WHERE id = ?').run(id);
    return result.changes > 0;
  },

  /**
   * Get notices by affected state
   * @param {string} state - State code
   * @param {boolean} activeOnly - Get only active notices
   * @returns {Array} Array of notice objects
   */
  getByState(state, activeOnly = true) {
    if (activeOnly) {
      return this.getActive({ state });
    }
    return this.getAll({ state });
  },

  /**
   * Get count by jurisdiction type
   * @param {boolean} activeOnly - Count only active notices
   * @returns {Array} Array of {jurisdiction_type, count} objects
   */
  getCountByType(activeOnly = true) {
    const db = getDatabase();
    let query = 'SELECT jurisdiction_type, COUNT(*) as count FROM notices';
    if (activeOnly) {
      query += ' WHERE (expiration_time IS NULL OR datetime(expiration_time) > datetime(\'now\'))';
    }
    query += ' GROUP BY jurisdiction_type ORDER BY count DESC';
    return db.prepare(query).all();
  }
};

module.exports = NoticeModel;
