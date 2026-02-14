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
    const db = getDatabase();
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
    const db = getDatabase();
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
   * Find advisory by external ID (NOAA's unique identifier)
   * Primary deduplication strategy - external_id is always unique per alert
   * @param {string} externalId - External ID from NOAA API
   * @returns {Promise<Object|null>} Existing advisory or null
   */
  async findByExternalID(externalId) {
    if (!externalId) return null;
    
    const db = getDatabase();
    const query = 'SELECT * FROM advisories WHERE external_id = ? LIMIT 1';
    
    try {
      const [rows] = await db.query(query, [externalId]);
      return rows[0] || null;
    } catch (error) {
      console.error('Error finding advisory by external ID:', error);
      return null;
    }
  },

  /**
   * Find advisory by VTEC event ID (persistent identifier)
   * Used to check if an alert update already exists before creating a duplicate
   * Event ID stays the same across NEW→CON→EXT→EXP updates
   * @param {string} vtecEventId - VTEC event ID (e.g., "PAJK.HW.W.0006")
   * @param {number} siteId - Site ID
   * @param {string} advisoryType - Advisory type (optional for additional validation)
   * @returns {Promise<Object|null>} Existing advisory or null
   */
  async findByVTECEventID(vtecEventId, siteId, advisoryType = null) {
    if (!vtecEventId) return null;
    
    const db = getDatabase();
    let query = 'SELECT * FROM advisories WHERE vtec_event_id = ? AND site_id = ? AND status = ?';
    const params = [vtecEventId, siteId, 'active'];
    
    // Optional: also match on advisory_type for extra safety
    if (advisoryType) {
      query += ' AND advisory_type = ?';
      params.push(advisoryType);
    }
    
    query += ' ORDER BY last_updated DESC LIMIT 1';
    
    try {
      const [rows] = await db.query(query, params);
      return rows[0] || null;
    } catch (error) {
      console.error('Error finding advisory by VTEC event ID:', error);
      return null;
    }
  },

  /**
   * Find advisory by VTEC code (legacy - for backward compatibility)
   * @deprecated Use findByVTECEventID instead
   */
  async findByVTEC(vtecCode, siteId, advisoryType = null) {
    if (!vtecCode) return null;
    
    const db = getDatabase();
    let query = 'SELECT * FROM advisories WHERE vtec_code = ? AND site_id = ?';
    const params = [vtecCode, siteId];
    
    if (advisoryType) {
      query += ' AND advisory_type = ?';
      params.push(advisoryType);
    }
    
    query += ' ORDER BY last_updated DESC LIMIT 1';
    
    try {
      const [rows] = await db.query(query, params);
      return rows[0] || null;
    } catch (error) {
      console.error('Error finding advisory by VTEC:', error);
      return null;
    }
  },

  /**
   * Create or update advisory (upsert)
   * Deduplication strategy:
   *   1. Check by external_id (always present, always unique)
   *   2. If not found and has VTEC, check by vtec_event_id
   *   3. Create new or update existing
   * @param {Object} advisory - Advisory data
   * @returns {Promise<Object>} Created/updated advisory with ID
   */
  async create(advisory) {
    const db = getDatabase();
    try {
      // Extract external_id early for deduplication check
      let externalId = advisory.external_id;
      if (!externalId && advisory.raw_payload) {
        const payload = typeof advisory.raw_payload === 'string' 
          ? JSON.parse(advisory.raw_payload)
          : advisory.raw_payload;
        externalId = payload.id || payload.properties?.id;
      }

      // Primary deduplication: Check by external_id first (always present)
      if (externalId) {
        const existing = await this.findByExternalID(externalId);
        if (existing) {
          const action = advisory.vtec_action || 'UPD';
          console.log(`Updating existing advisory via external_id [${action}]: ${externalId.substring(0, 40)}... for site ${advisory.site_id}`);
          return this.update(existing.id, advisory);
        }
      }

      // Secondary deduplication: VTEC Event ID (for alerts without external_id or as fallback)
      // If VTEC event ID exists, check if we already have this event and update it
      // Event ID stays consistent across NEW→CON→EXT updates
      if (advisory.vtec_event_id) {
        const existing = await this.findByVTECEventID(
          advisory.vtec_event_id,
          advisory.site_id,
          advisory.advisory_type
        );
        
        if (existing) {
          // Update existing alert with new data
          const action = advisory.vtec_action || 'UNK';
          console.log(`Updating existing event via VTEC [${action}]: ${advisory.vtec_event_id} for site ${advisory.site_id}`);
          return this.update(existing.id, advisory);
        }
      }
      
      // external_id already extracted above for deduplication check
      const rawPayloadStr = advisory.raw_payload
        ? (typeof advisory.raw_payload === 'string' ? advisory.raw_payload : JSON.stringify(advisory.raw_payload))
        : null;

      // Insert new alert (or update by external_id if duplicate external_id)
      const [result] = await db.query(`
        INSERT INTO advisories (
          external_id, site_id, advisory_type, severity, status, source,
          headline, description, start_time, end_time, issued_time, 
          vtec_code, vtec_event_id, vtec_action, raw_payload
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          site_id = VALUES(site_id),
          advisory_type = VALUES(advisory_type),
          severity = VALUES(severity),
          status = VALUES(status),
          source = VALUES(source),
          headline = VALUES(headline),
          description = VALUES(description),
          start_time = VALUES(start_time),
          end_time = VALUES(end_time),
          issued_time = VALUES(issued_time),
          vtec_code = VALUES(vtec_code),
          vtec_event_id = VALUES(vtec_event_id),
          vtec_action = VALUES(vtec_action),
          raw_payload = VALUES(raw_payload),
          last_updated = CURRENT_TIMESTAMP
      `, [
        externalId,
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
        advisory.vtec_code || null,
        advisory.vtec_event_id || null,
        advisory.vtec_action || null,
        rawPayloadStr
      ]);

      return this.getById(result.insertId || result.lastInsertId || advisory.id);
    } catch (error) {
      // Handle unique constraint violation (ER_DUP_ENTRY)
      // This can happen if a duplicate event is inserted between the findByVTECEventID check and insert
      if (error.code === 'ER_DUP_ENTRY' && advisory.vtec_event_id) {
        console.log(`Duplicate event detected via constraint: ${advisory.vtec_event_id} [${advisory.vtec_action}] - fetching existing alert`);
        // Find and return the existing alert
        const existing = await this.findByVTECEventID(
          advisory.vtec_event_id,
          advisory.site_id,
          advisory.advisory_type
        );
        if (existing) {
          // Update it with the new data
          return this.update(existing.id, advisory);
        }
      }
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
    const db = getDatabase();
    const fields = [];
    const params = [];

    for (const [key, value] of Object.entries(updates)) {
      if (key !== 'id' && key !== 'site_id') {
        // Handle raw_payload JSON serialization
        if (key === 'raw_payload' && value && typeof value === 'object') {
          fields.push(`${key} = ?`);
          params.push(JSON.stringify(value));
        } else {
          fields.push(`${key} = ?`);
          params.push(value);
        }
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
    const db = getDatabase();
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
    const db = getDatabase();
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
    const db = getDatabase();
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
    const db = getDatabase();
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
