/**
 * Site Model
 * Data access layer for sites table
 */

const { getDatabase } = require('../config/database');

const SiteModel = {
  /**
   * Get all sites
   * @param {Object} filters - Optional filters (state, region)
   * @returns {Promise<Array>} Array of site objects
   */
  async getAll(filters = {}) {
    const db = getDatabase();
    let query = 'SELECT * FROM sites';
    const params = [];
    const conditions = [];

    if (filters.state) {
      conditions.push('state = ?');
      params.push(filters.state);
    }

    if (filters.region) {
      conditions.push('region = ?');
      params.push(filters.region);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY state, city';

    const [rows] = await db.query(query, params);
    return rows;
  },

  /**
   * Get site by ID
   * @param {number} id - Site ID
   * @returns {Promise<Object|null>} Site object or null
   */
  async getById(id) {
    const db = getDatabase();
    const [rows] = await db.query('SELECT * FROM sites WHERE id = ?', [id]);
    return rows[0] || null;
  },

  /**
   * Get site by site code
   * @param {string} siteCode - Site code
   * @returns {Promise<Object|null>} Site object or null
   */
  async getBySiteCode(siteCode) {
    const db = getDatabase();
    const [rows] = await db.query('SELECT * FROM sites WHERE site_code = ?', [siteCode]);
    return rows[0] || null;
  },

  /**
   * Get sites by multiple IDs
   * @param {Array<number>} ids - Array of site IDs
   * @returns {Promise<Array>} Array of site objects
   */
  async getByIds(ids) {
    if (!ids || ids.length === 0) return [];
    const db = getDatabase();
    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await db.query(
      `SELECT * FROM sites WHERE id IN (${placeholders})`,
      ids
    );
    return rows;
  },

  /**
   * Get sites by state
   * @param {string} state - State code (2-letter)
   * @returns {Promise<Array>} Array of site objects
   */
  async getByState(state) {
    const db = getDatabase();
    const [rows] = await db.query('SELECT * FROM sites WHERE state = ? ORDER BY city', [state]);
    return rows;
  },

  /**
   * Find sites near coordinates (within radius)
   * @param {number} lat - Latitude
   * @param {number} lon - Longitude
   * @param {number} radiusMiles - Radius in miles (default 50)
   * @returns {Array} Array of site objects with distance
   */
  async findNearby(lat, lon, radiusMiles = 50) {
    const db = getDatabase();
    // Using Haversine formula approximation
    const query = `
      SELECT *,
        (3959 * acos(
          cos(radians(?)) * cos(radians(latitude)) *
          cos(radians(longitude) - radians(?)) +
          sin(radians(?)) * sin(radians(latitude))
        )) AS distance
      FROM sites
      WHERE (3959 * acos(
        cos(radians(?)) * cos(radians(latitude)) *
        cos(radians(longitude) - radians(?)) +
        sin(radians(?)) * sin(radians(latitude))
      )) <= ?
      ORDER BY distance
    `;
    const [rows] = await db.query(query, [lat, lon, lat, lat, lon, lat, radiusMiles]);
    return rows;
  },

  /**
   * Get count of sites by state
   * @returns {Promise<Array>} Array of {state, count} objects
   */
  async getCountByState() {
    const db = getDatabase();
    const [rows] = await db.query(`
      SELECT state, COUNT(*) as count
      FROM sites
      GROUP BY state
      ORDER BY count DESC
    `);
    return rows;
  },

  /**
   * Get distinct states
   * @returns {Promise<Array>} Array of state codes
   */
  async getStates() {
    const db = getDatabase();
    const [rows] = await db.query('SELECT DISTINCT state FROM sites ORDER BY state');
    return rows.map(row => row.state);
  },

  /**
   * Get distinct regions
   * @returns {Promise<Array>} Array of region names
   */
  async getRegions() {
    const db = getDatabase();
    const [rows] = await db.query('SELECT DISTINCT region FROM sites WHERE region IS NOT NULL ORDER BY region');
    return rows.map(row => row.region);
  }
};

module.exports = SiteModel;
