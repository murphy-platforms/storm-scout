/**
 * Office Status Model
 * Data access layer for office_status table
 */

const { getDatabase } = require('../config/database');

const OfficeStatusModel = {
  /**
   * Get all office statuses with office information
   * @param {Object} filters - Optional filters (operational_status)
   * @returns {Promise<Array>} Array of office status objects with office data
   */
  async getAll(filters = {}) {
    const db = getDatabase();
    let query = `
      SELECT ss.*, s.office_code, s.name, s.city, s.state, s.region,
             s.latitude, s.longitude
      FROM office_status ss
      JOIN offices s ON ss.office_id = s.id
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
   * Get status for a specific office
   * @param {number} officeId - Office ID
   * @returns {Promise<Object|null>} Office status object or null
   */
  async getByOffice(officeId) {
    const db = getDatabase();
    const [rows] = await db.query(`
      SELECT ss.*, s.office_code, s.name, s.city, s.state, s.region
      FROM office_status ss
      JOIN offices s ON ss.office_id = s.id
      WHERE ss.office_id = ?
    `, [officeId]);
    return rows[0] || null;
  },

  /**
   * Get offices by operational status
   * @param {string} status - Operational status
   * @returns {Array} Array of office status objects
   */
  getByStatus(status) {
    return this.getAll({ operational_status: status });
  },

  /**
   * Get impacted offices (Closed or At Risk)
   * @returns {Promise<Array>} Array of impacted office objects
   */
  async getImpacted() {
    const db = getDatabase();
    // Derived-table LEFT JOIN replaces a correlated subquery that executed once
    // per result row. The derived table aggregates advisory counts in a single
    // pass before joining, avoiding N sequential COUNT(*) executions. (closes #107)
    const [rows] = await db.query(`
      SELECT ss.*, s.office_code, s.name, s.city, s.state, s.region,
             COALESCE(ac.advisory_count, 0) as advisory_count
      FROM office_status ss
      JOIN offices s ON ss.office_id = s.id
      LEFT JOIN (
        SELECT office_id, COUNT(*) as advisory_count
        FROM advisories
        WHERE status = 'active'
        GROUP BY office_id
      ) ac ON ac.office_id = ss.office_id
      WHERE ss.operational_status IN ('Closed', 'At Risk')
      ORDER BY ss.operational_status DESC, s.state, s.city
    `);
    return rows;
  },

  /**
   * Update or create office status
   * @param {number} officeId - Office ID
   * @param {Object} statusData - Status data object
   * @param {string} statusData.operational_status - Operational status (open_normal, open_restricted, closed, pending)
   * @param {string} statusData.weather_impact_level - Weather impact (green, yellow, orange, red)
   * @param {string} statusData.reason - Legacy reason field
   * @param {string} statusData.decision_by - Who made the operational decision
   * @param {string} statusData.decision_reason - Reason for operational decision
   * @returns {Promise<Object>} Updated office status
   */
  async upsert(officeId, statusData) {
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

    const fields = ['office_id'];
    const values = [officeId];
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
      INSERT INTO office_status (${insertFields.join(', ')})
      VALUES (${placeholders}, NOW())
      ON DUPLICATE KEY UPDATE
        ${updates.join(',\n        ')}
    `, values);

    return this.getByOffice(officeId);
  },

  /**
   * Set operational status manually (for USPS Operations use)
   * @param {number} officeId - Office ID
   * @param {string} operationalStatus - Operational status (open_normal, open_restricted, closed, pending)
   * @param {string} decisionBy - User who made the decision
   * @param {string} decisionReason - Reason for the decision
   * @returns {Promise<Object>} Updated office status
   */
  async setOperationalStatus(officeId, operationalStatus, decisionBy, decisionReason) {
    return this.upsert(officeId, {
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
      FROM office_status
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
      FROM office_status
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
   * Bulk update operational status for multiple offices
   * @param {Array<number>} officeIds - Array of office IDs
   * @param {string} operationalStatus - Operational status
   * @param {string} decisionBy - User who made the decision
   * @param {string} decisionReason - Reason for the decision
   * @returns {Promise<number>} Number of offices updated
   */
  async bulkSetOperationalStatus(officeIds, operationalStatus, decisionBy, decisionReason) {
    const db = getDatabase();
    const [result] = await db.query(`
      UPDATE office_status
      SET
        operational_status = ?,
        decision_by = ?,
        decision_at = NOW(),
        decision_reason = ?,
        last_updated = NOW()
      WHERE office_id IN (?)
    `, [operationalStatus, decisionBy, decisionReason, officeIds]);
    return result.affectedRows;
  },

  /**
   * Get recently updated statuses
   * @param {number} limit - Max number of results
   * @returns {Promise<Array>} Array of recently updated office statuses
   */
  async getRecentlyUpdated(limit = 10) {
    const db = getDatabase();
    const [rows] = await db.query(`
      SELECT ss.*, s.office_code, s.name, s.city, s.state
      FROM office_status ss
      JOIN offices s ON ss.office_id = s.id
      ORDER BY ss.last_updated DESC
      LIMIT ?
    `, [limit]);
    return rows;
  }
};

module.exports = OfficeStatusModel;
