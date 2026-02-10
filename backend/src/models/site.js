/**
 * Site Model
 * Data access layer for sites table
 */

const { getDatabase } = require('../config/database');

const SiteModel = {
  /**
   * Get all sites
   * @param {Object} filters - Optional filters (state, region)
   * @returns {Array} Array of site objects
   */
  getAll(filters = {}) {
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

    return db.prepare(query).all(...params);
  },

  /**
   * Get site by ID
   * @param {number} id - Site ID
   * @returns {Object|null} Site object or null
   */
  getById(id) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM sites WHERE id = ?').get(id);
  },

  /**
   * Get site by site code
   * @param {string} siteCode - Site code
   * @returns {Object|null} Site object or null
   */
  getBySiteCode(siteCode) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM sites WHERE site_code = ?').get(siteCode);
  },

  /**
   * Get sites by state
   * @param {string} state - State code (2-letter)
   * @returns {Array} Array of site objects
   */
  getByState(state) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM sites WHERE state = ? ORDER BY city').all(state);
  },

  /**
   * Find sites near coordinates (within radius)
   * @param {number} lat - Latitude
   * @param {number} lon - Longitude
   * @param {number} radiusMiles - Radius in miles (default 50)
   * @returns {Array} Array of site objects with distance
   */
  findNearby(lat, lon, radiusMiles = 50) {
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
    return db.prepare(query).all(lat, lon, lat, lat, lon, lat, radiusMiles);
  },

  /**
   * Get count of sites by state
   * @returns {Array} Array of {state, count} objects
   */
  getCountByState() {
    const db = getDatabase();
    return db.prepare(`
      SELECT state, COUNT(*) as count
      FROM sites
      GROUP BY state
      ORDER BY count DESC
    `).all();
  },

  /**
   * Get distinct states
   * @returns {Array} Array of state codes
   */
  getStates() {
    const db = getDatabase();
    return db.prepare('SELECT DISTINCT state FROM sites ORDER BY state').all().map(row => row.state);
  },

  /**
   * Get distinct regions
   * @returns {Array} Array of region names
   */
  getRegions() {
    const db = getDatabase();
    return db.prepare('SELECT DISTINCT region FROM sites WHERE region IS NOT NULL ORDER BY region').all().map(row => row.region);
  }
};

module.exports = SiteModel;
