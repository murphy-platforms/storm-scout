/**
 * Advisory Model - MySQL/MariaDB
 * Data access layer for advisories table
 */

const { getDatabase } = require('../config/database');

const AdvisoryModel = {
    /**
     * Get all advisories with optional filters
     * @param {Object} filters - Optional filters (status, severity, state, office_id, advisory_type)
     * @returns {Promise<Array>} Array of advisory objects with office data
     */
    async getAll(filters = {}) {
        const db = getDatabase();
        let query = `
      SELECT a.*, s.office_code, s.name as office_name, s.city, s.state, s.region
      FROM advisories a
      JOIN offices s ON a.office_id = s.id
      WHERE 1=1
    `;
        const params = [];

        if (filters.status) {
            query += ' AND a.status = ?';
            params.push(filters.status);
        }

        // Support multiple severity values (array or comma-separated string)
        if (filters.severity) {
            const severities = Array.isArray(filters.severity)
                ? filters.severity
                : filters.severity.split(',').map((s) => s.trim());

            if (severities.length > 0) {
                query += ` AND a.severity IN (${severities.map(() => '?').join(', ')})`;
                params.push(...severities);
            }
        }

        // Support multiple advisory types
        if (filters.advisory_type) {
            const types = Array.isArray(filters.advisory_type)
                ? filters.advisory_type
                : filters.advisory_type.split(',').map((t) => t.trim());

            if (types.length > 0) {
                query += ` AND a.advisory_type IN (${types.map(() => '?').join(', ')})`;
                params.push(...types);
            }
        }

        if (filters.state) {
            query += ' AND s.state = ?';
            params.push(filters.state);
        }

        if (filters.office_id) {
            query += ' AND a.office_id = ?';
            params.push(filters.office_id);
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
            const [rows] = await db.query(
                `
        SELECT a.*, s.office_code, s.name as office_name, s.city, s.state, s.region
        FROM advisories a
        JOIN offices s ON a.office_id = s.id
        WHERE a.id = ?
      `,
                [id]
            );
            return rows[0] || null;
        } catch (error) {
            console.error('Error fetching advisory by ID:', error);
            return null;
        }
    },

    /**
     * Get advisories for a specific office
     * @param {number} officeId - Office ID
     * @param {boolean} activeOnly - Get only active advisories
     * @returns {Promise<Array>} Array of advisory objects
     */
    async getByOffice(officeId, activeOnly = false) {
        const db = getDatabase();
        let query = 'SELECT * FROM advisories WHERE office_id = ?';
        const params = [officeId];

        if (activeOnly) {
            query += ' AND status = ?';
            params.push('active');
        }

        query += ' ORDER BY severity DESC, last_updated DESC';

        try {
            const [rows] = await db.query(query, params);
            return rows;
        } catch (error) {
            console.error('Error fetching advisories for office:', error);
            return [];
        }
    },

    /**
     * Find advisory by external ID (NOAA's unique identifier)
     * Primary deduplication strategy - external_id is unique per alert+office
     * @param {string} externalId - External ID from NOAA API
     * @param {number} officeId - Office ID (required for composite unique lookup)
     * @returns {Promise<Object|null>} Existing advisory or null
     */
    async findByExternalID(externalId, officeId) {
        if (!externalId) return null;

        const db = getDatabase();

        // When officeId is provided, look up the specific (external_id, office_id) pair
        if (officeId) {
            const query = 'SELECT * FROM advisories WHERE external_id = ? AND office_id = ? LIMIT 1';
            try {
                const [rows] = await db.query(query, [externalId, officeId]);
                return rows[0] || null;
            } catch (error) {
                console.error('Error finding advisory by external ID:', error);
                return null;
            }
        }

        // Fallback: no officeId (legacy callers)
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
     * @param {number} officeId - Office ID
     * @param {string} advisoryType - Advisory type (optional for additional validation)
     * @returns {Promise<Object|null>} Existing advisory or null
     */
    async findByVTECEventID(vtecEventId, officeId, advisoryType = null) {
        if (!vtecEventId) return null;

        const db = getDatabase();
        let query = 'SELECT * FROM advisories WHERE vtec_event_id = ? AND office_id = ? AND status = ?';
        const params = [vtecEventId, officeId, 'active'];

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
     * Find advisory by natural key — last-resort dedup when external_id and VTEC are both null.
     * Matches on (office_id, advisory_type, source, start_time). start_time may be null;
     * two rows with null start_time and the same other fields are treated as the same alert.
     * @param {number} officeId
     * @param {string} advisoryType
     * @param {string} source
     * @param {string|null} startTime
     * @returns {Promise<Object|null>}
     */
    async findByNaturalKey(officeId, advisoryType, source, startTime) {
        const db = getDatabase();
        let query = `
      SELECT * FROM advisories
      WHERE office_id = ? AND advisory_type = ? AND source = ? AND status = 'active'
    `;
        const params = [officeId, advisoryType, source];

        if (startTime != null) {
            query += ' AND start_time = ?';
            params.push(startTime);
        } else {
            query += ' AND start_time IS NULL';
        }

        query += ' ORDER BY last_updated DESC LIMIT 1';

        try {
            const [rows] = await db.query(query, params);
            return rows[0] || null;
        } catch (error) {
            console.error('Error finding advisory by natural key:', error);
            return null;
        }
    },

    /**
     * Find advisory by VTEC code (legacy - for backward compatibility)
     * @deprecated Use findByVTECEventID instead
     */
    async findByVTEC(vtecCode, officeId, advisoryType = null) {
        if (!vtecCode) return null;

        const db = getDatabase();
        let query = 'SELECT * FROM advisories WHERE vtec_code = ? AND office_id = ?';
        const params = [vtecCode, officeId];

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
     * @param {Object} [existingLookup] - Optional pre-fetched lookup maps to skip SELECT queries.
     *   When provided by the ingestor's bulk pre-fetch, eliminates per-row DB round-trips.
     *   The ER_DUP_ENTRY catch block below remains as a safety net for concurrent inserts.
     * @param {Map} [existingLookup.byExternalId] - key: `${external_id}|${office_id}`
     * @param {Map} [existingLookup.byVtec]        - key: `${vtec_event_id}|${office_id}|${advisory_type}`
     * @returns {Promise<Object>} Created/updated advisory with ID
     */
    async create(advisory, existingLookup = null) {
        const db = getDatabase();
        try {
            // Extract external_id — normalizer now populates this upfront, but
            // fall back to raw_payload extraction for direct callers. (closes #265)
            let externalId = advisory.external_id;
            if (!externalId && advisory.raw_payload) {
                const payload =
                    typeof advisory.raw_payload === 'string' ? JSON.parse(advisory.raw_payload) : advisory.raw_payload;
                externalId = payload.id || payload.properties?.id;
            }

            // Primary deduplication: Check by external_id + office_id (composite unique).
            // This is the single authoritative dedup path. VTEC-based dedup is handled
            // atomically by the INSERT ON DUPLICATE KEY UPDATE below (via the
            // idx_vtec_event_unique_active constraint), eliminating the need for an
            // explicit SELECT-then-UPDATE for VTEC matches.
            if (externalId) {
                const existing = existingLookup
                    ? existingLookup.byExternalId.get(`${externalId}|${advisory.office_id}`) || null
                    : await this.findByExternalID(externalId, advisory.office_id);
                if (existing) {
                    const action = advisory.vtec_action || 'UPD';
                    console.log(
                        `Updating existing advisory via external_id [${action}]: ${externalId.substring(0, 40)}... for office ${advisory.office_id}`
                    );
                    return this.update(existing.id, advisory);
                }
            }

            // Safety-net deduplication: natural key when both external_id and VTEC are absent.
            // Malformed/legacy NOAA payloads may omit both fields; without this guard a
            // retry of the same payload produces a duplicate row. (closes #114)
            if (!externalId && !advisory.vtec_event_id) {
                const existing = await this.findByNaturalKey(
                    advisory.office_id,
                    advisory.advisory_type,
                    advisory.source,
                    advisory.start_time
                );
                if (existing) {
                    console.warn(
                        `[Advisory] Fallback natural-key dedup matched existing #${existing.id} (no external_id/VTEC). Updating instead of inserting.`
                    );
                    return this.update(existing.id, advisory);
                }
            }

            // external_id already extracted above for deduplication check
            const rawPayloadStr = advisory.raw_payload
                ? typeof advisory.raw_payload === 'string'
                    ? advisory.raw_payload
                    : JSON.stringify(advisory.raw_payload)
                : null;

            // Upsert: INSERT with ON DUPLICATE KEY UPDATE eliminates the TOCTOU
            // race window between the SELECT checks above and this write.
            // Both unique constraints (external_id+office_id and vtec_event_unique_key)
            // are covered — if a concurrent insert wins, the upsert merges cleanly.
            // `id = LAST_INSERT_ID(id)` ensures result.insertId returns the correct
            // row ID regardless of whether an INSERT or UPDATE occurred. (closes #260)
            const [result] = await db.query(
                `
        INSERT INTO advisories (
          external_id, office_id, advisory_type, severity, status, source,
          headline, description, start_time, end_time, issued_time,
          vtec_code, vtec_event_id, vtec_action, raw_payload
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          id = LAST_INSERT_ID(id),
          office_id = VALUES(office_id),
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
      `,
                [
                    externalId,
                    advisory.office_id,
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
                ]
            );

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
        const db = getDatabase();
        const fields = [];
        const params = [];

        for (const [key, value] of Object.entries(updates)) {
            if (key !== 'id' && key !== 'office_id') {
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
            const [rows] = await db.query(
                `
        SELECT a.*, s.office_code, s.name as office_name, s.city, s.state
        FROM advisories a
        JOIN offices s ON a.office_id = s.id
        WHERE a.status = 'active'
        ORDER BY a.last_updated DESC
        LIMIT ?
      `,
                [limit]
            );
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
