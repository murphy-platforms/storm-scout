/**
 * Observation Model
 * Data access layer for office_observations table
 * Stores current weather conditions per office (replaced each ingestion cycle)
 */

const { getDatabase } = require('../config/database');

const ObservationModel = {
    /**
     * Upsert observation for an office (INSERT or UPDATE if exists)
     * @param {number} officeId - Office ID
     * @param {Object} data - Observation data
     * @returns {Promise<Object>} Result
     */
    async upsert(officeId, data) {
        const db = getDatabase();
        const [result] = await db.query(
            `
      INSERT INTO office_observations (
        office_id, station_id, temperature_c, relative_humidity, dewpoint_c,
        wind_speed_kmh, wind_direction_deg, wind_gust_kmh,
        barometric_pressure_pa, visibility_m, wind_chill_c, heat_index_c,
        cloud_layers, text_description,
        observed_at, ingested_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        station_id = VALUES(station_id),
        temperature_c = VALUES(temperature_c),
        relative_humidity = VALUES(relative_humidity),
        dewpoint_c = VALUES(dewpoint_c),
        wind_speed_kmh = VALUES(wind_speed_kmh),
        wind_direction_deg = VALUES(wind_direction_deg),
        wind_gust_kmh = VALUES(wind_gust_kmh),
        barometric_pressure_pa = VALUES(barometric_pressure_pa),
        visibility_m = VALUES(visibility_m),
        wind_chill_c = VALUES(wind_chill_c),
        heat_index_c = VALUES(heat_index_c),
        cloud_layers = VALUES(cloud_layers),
        text_description = VALUES(text_description),
        observed_at = VALUES(observed_at),
        ingested_at = NOW()
    `,
            [
                officeId,
                data.station_id,
                data.temperature_c,
                data.relative_humidity,
                data.dewpoint_c,
                data.wind_speed_kmh,
                data.wind_direction_deg,
                data.wind_gust_kmh,
                data.barometric_pressure_pa,
                data.visibility_m,
                data.wind_chill_c,
                data.heat_index_c,
                data.cloud_layers,
                data.text_description,
                data.observed_at
            ]
        );
        return result;
    },

    /**
     * Get observation for a specific office by ID
     * @param {number} officeId - Office ID
     * @returns {Promise<Object|null>} Observation or null
     */
    async getByOfficeId(officeId) {
        const db = getDatabase();
        const [rows] = await db.query('SELECT * FROM office_observations WHERE office_id = ?', [officeId]);
        return rows[0] || null;
    },

    /**
     * Get all observations joined with office info
     * @returns {Promise<Array>} Array of observations with office data
     */
    async getAll() {
        const db = getDatabase();
        const [rows] = await db.query(`
      SELECT
        o.*,
        s.office_code,
        s.name as office_name,
        s.city,
        s.state,
        s.observation_station
      FROM office_observations o
      JOIN offices s ON o.office_id = s.id
      ORDER BY s.state, s.city
    `);
        return rows;
    },

    /**
     * Get observation by office code
     * @param {string} officeCode - Office code (5-digit zip)
     * @returns {Promise<Object|null>} Observation with office data or null
     */
    async getByOfficeCode(officeCode) {
        const db = getDatabase();
        const [rows] = await db.query(
            `
      SELECT
        o.*,
        s.office_code,
        s.name as office_name,
        s.city,
        s.state,
        s.observation_station
      FROM office_observations o
      JOIN offices s ON o.office_id = s.id
      WHERE s.office_code = ?
    `,
            [officeCode]
        );
        return rows[0] || null;
    }
};

module.exports = ObservationModel;
