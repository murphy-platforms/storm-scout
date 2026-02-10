/**
 * API Client for external weather/emergency data sources
 * Handles HTTP requests with proper headers and error handling
 */

const axios = require('axios');
const config = require('../../config/config');

/**
 * Create NOAA API client
 */
const noaaClient = axios.create({
  baseURL: config.noaa.baseUrl,
  timeout: 30000,
  headers: {
    'User-Agent': config.noaa.userAgent,
    'Accept': 'application/json'
  }
});

/**
 * Get active weather alerts from NOAA for US
 * @returns {Promise<Array>} Array of alert features
 */
async function getNOAAAlerts() {
  try {
    console.log('Fetching active weather alerts from NOAA...');
    const response = await noaaClient.get('/alerts/active');
    
    if (response.data && response.data.features) {
      console.log(`✓ Received ${response.data.features.length} alerts from NOAA`);
      return response.data.features;
    }
    
    return [];
  } catch (error) {
    console.error('Error fetching NOAA alerts:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    throw error;
  }
}

/**
 * Get weather alerts for a specific point (lat/lon)
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {Promise<Array>} Array of alert features
 */
async function getNOAAAlertsByPoint(lat, lon) {
  try {
    const response = await noaaClient.get(`/alerts/active?point=${lat},${lon}`);
    
    if (response.data && response.data.features) {
      return response.data.features;
    }
    
    return [];
  } catch (error) {
    console.error(`Error fetching NOAA alerts for point (${lat},${lon}):`, error.message);
    return [];
  }
}

/**
 * Get weather alerts by state
 * @param {string} state - Two-letter state code
 * @returns {Promise<Array>} Array of alert features
 */
async function getNOAAAlertsByState(state) {
  try {
    const response = await noaaClient.get(`/alerts/active?area=${state}`);
    
    if (response.data && response.data.features) {
      return response.data.features;
    }
    
    return [];
  } catch (error) {
    console.error(`Error fetching NOAA alerts for state ${state}:`, error.message);
    return [];
  }
}

module.exports = {
  noaaClient,
  getNOAAAlerts,
  getNOAAAlertsByPoint,
  getNOAAAlertsByState
};
