/**
 * API Client for external weather/emergency data sources
 * Handles HTTP requests with rate limiting, retry logic, and proper error handling
 */

const axios = require('axios');
const config = require('../../config/config');

// Rate limiting configuration
const RATE_LIMIT = {
  minRequestIntervalMs: 500,  // Minimum time between requests (2 req/sec max)
  lastRequestTime: 0
};

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  retryableStatuses: [408, 429, 500, 502, 503, 504],  // Timeout, rate limit, server errors
  retryableCodes: ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND']
};

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Enforce rate limiting between requests
 */
async function enforceRateLimit() {
  const now = Date.now();
  const timeSinceLastRequest = now - RATE_LIMIT.lastRequestTime;
  
  if (timeSinceLastRequest < RATE_LIMIT.minRequestIntervalMs) {
    await sleep(RATE_LIMIT.minRequestIntervalMs - timeSinceLastRequest);
  }
  
  RATE_LIMIT.lastRequestTime = Date.now();
}

/**
 * Check if error is retryable
 */
function isRetryable(error) {
  if (error.response) {
    return RETRY_CONFIG.retryableStatuses.includes(error.response.status);
  }
  return RETRY_CONFIG.retryableCodes.some(code => 
    error.code === code || error.message?.includes(code)
  );
}

/**
 * Execute request with retry logic
 */
async function requestWithRetry(requestFn, description = 'API request') {
  let lastError;
  let delay = RETRY_CONFIG.initialDelayMs;
  
  for (let attempt = 1; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      await enforceRateLimit();
      return await requestFn();
    } catch (error) {
      lastError = error;
      
      if (!isRetryable(error) || attempt === RETRY_CONFIG.maxRetries) {
        throw error;
      }
      
      // Handle rate limit (429) with Retry-After header
      if (error.response?.status === 429) {
        const retryAfter = error.response.headers['retry-after'];
        if (retryAfter) {
          delay = parseInt(retryAfter, 10) * 1000;
        }
      }
      
      console.warn(`${description} failed (attempt ${attempt}/${RETRY_CONFIG.maxRetries}): ${error.message}. Retrying in ${delay}ms...`);
      await sleep(delay);
      delay = Math.min(delay * 2, RETRY_CONFIG.maxDelayMs);
    }
  }
  
  throw lastError;
}

/**
 * Validate User-Agent is configured
 */
function validateConfig() {
  if (!config.noaa.userAgent) {
    throw new Error(
      'NOAA_API_USER_AGENT environment variable is required. ' +
      'Format: AppName/Version (contact-email@domain.com)'
    );
  }
}

/**
 * Create NOAA API client with proper configuration
 */
function createNoaaClient() {
  validateConfig();
  
  return axios.create({
    baseURL: config.noaa.baseUrl,
    timeout: 30000,
    headers: {
      'User-Agent': config.noaa.userAgent,
      'Accept': 'application/geo+json'  // NOAA's preferred format
    }
  });
}

// Lazy-initialize client (allows for config validation at runtime)
let _noaaClient = null;
function getNoaaClient() {
  if (!_noaaClient) {
    _noaaClient = createNoaaClient();
  }
  return _noaaClient;
}

/**
 * Get active weather alerts from NOAA for US
 * @returns {Promise<Array>} Array of alert features
 */
async function getNOAAAlerts() {
  return requestWithRetry(async () => {
    console.log('Fetching active weather alerts from NOAA...');
    const response = await getNoaaClient().get('/alerts/active');
    
    if (response.data && response.data.features) {
      console.log(`✓ Received ${response.data.features.length} alerts from NOAA`);
      return response.data.features;
    }
    
    return [];
  }, 'Fetch NOAA alerts');
}

/**
 * Get weather alerts for a specific point (lat/lon)
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {Promise<Array>} Array of alert features
 */
async function getNOAAAlertsByPoint(lat, lon) {
  return requestWithRetry(async () => {
    const response = await getNoaaClient().get(`/alerts/active?point=${lat},${lon}`);
    
    if (response.data && response.data.features) {
      return response.data.features;
    }
    
    return [];
  }, `Fetch NOAA alerts for point (${lat},${lon})`);
}

/**
 * Get weather alerts by state
 * @param {string} state - Two-letter state code
 * @returns {Promise<Array>} Array of alert features
 */
async function getNOAAAlertsByState(state) {
  return requestWithRetry(async () => {
    const response = await getNoaaClient().get(`/alerts/active?area=${state}`);
    
    if (response.data && response.data.features) {
      return response.data.features;
    }
    
    return [];
  }, `Fetch NOAA alerts for state ${state}`);
}

/**
 * Get UGC zone information for geocoding
 * @param {string} ugcCode - UGC code (e.g., 'FLZ076')
 * @returns {Promise<Object|null>} Zone info or null
 */
async function getUGCZoneInfo(ugcCode) {
  return requestWithRetry(async () => {
    // UGC codes have format: SSZ### (state, type, number)
    // Types: Z=zone, C=county
    const stateCode = ugcCode.substring(0, 2);
    const zoneType = ugcCode.substring(2, 3);
    const zoneNum = ugcCode.substring(3);
    
    const endpoint = zoneType === 'C' 
      ? `/zones/county/${ugcCode}`
      : `/zones/forecast/${ugcCode}`;
    
    const response = await getNoaaClient().get(endpoint);
    return response.data?.properties || null;
  }, `Fetch UGC zone info for ${ugcCode}`);
}

/**
 * Get observation stations for a lat/lon point
 * Calls /points/{lat},{lon} then follows observationStations URL
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {Promise<Array>} Array of station objects (ordered by proximity)
 */
async function getObservationStations(lat, lon) {
  return requestWithRetry(async () => {
    // Step 1: Get grid point info
    const pointResponse = await getNoaaClient().get(`/points/${lat},${lon}`);
    const stationsUrl = pointResponse.data?.properties?.observationStations;
    
    if (!stationsUrl) {
      console.warn(`No observation stations URL for point (${lat},${lon})`);
      return [];
    }
    
    // Step 2: Fetch the station list (full URL, not relative)
    await enforceRateLimit();
    const stationsResponse = await axios.get(stationsUrl, {
      timeout: 30000,
      headers: {
        'User-Agent': config.noaa.userAgent,
        'Accept': 'application/geo+json'
      }
    });
    
    if (stationsResponse.data && stationsResponse.data.features) {
      return stationsResponse.data.features.map(f => f.properties);
    }
    
    return [];
  }, `Fetch observation stations for point (${lat},${lon})`);
}

/**
 * Get latest observation from a specific station
 * @param {string} stationId - ICAO station identifier (e.g., 'KORD')
 * @returns {Promise<Object|null>} Observation properties or null
 */
async function getLatestObservation(stationId) {
  return requestWithRetry(async () => {
    const response = await getNoaaClient().get(`/stations/${stationId}/observations/latest`);
    return response.data?.properties || null;
  }, `Fetch latest observation for station ${stationId}`);
}

module.exports = {
  getNOAAAlerts,
  getNOAAAlertsByPoint,
  getNOAAAlertsByState,
  getUGCZoneInfo,
  getObservationStations,
  getLatestObservation,
  // Export for testing
  _internal: {
    requestWithRetry,
    enforceRateLimit,
    isRetryable
  }
};
