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

// ---------------------------------------------------------------------------
// Circuit Breaker for NOAA API
//
// Counts failures at the requestWithRetry() call level, not per HTTP attempt.
// One call to requestWithRetry() that exhausts all 3 retries = 1 failure.
// This means the circuit opens after 3 fully-retried failures in a row,
// avoiding false-opens from isolated transient errors.
//
// States:
//   CLOSED    — Normal operation. Requests pass through.
//   OPEN      — NOAA is down. Requests are rejected immediately without
//               attempting a network call. Re-checks after recoveryTimeMs.
//   HALF_OPEN — Testing recovery. One request is allowed through.
//               Two consecutive successes → CLOSED.
//               Any failure → back to OPEN.
// ---------------------------------------------------------------------------
const CIRCUIT_BREAKER = {
  state: 'CLOSED',
  failureCount: 0,
  lastFailureTime: null,
  successCount: 0,
  // Thresholds
  failureThreshold: 3,          // Open after 3 consecutive requestWithRetry failures
  recoveryTimeMs: 60 * 1000,    // Try recovery after 60 seconds
  halfOpenSuccessThreshold: 2   // Close after 2 consecutive successful probes
};

/**
 * Returns a snapshot of current circuit breaker state (safe to expose in /health).
 */
function getCircuitBreakerState() {
  return {
    state: CIRCUIT_BREAKER.state,
    failureCount: CIRCUIT_BREAKER.failureCount,
    lastFailureTime: CIRCUIT_BREAKER.lastFailureTime
      ? new Date(CIRCUIT_BREAKER.lastFailureTime).toISOString()
      : null,
    recoveryTimeMs: CIRCUIT_BREAKER.recoveryTimeMs
  };
}

/**
 * Call at the start of requestWithRetry. Throws if the circuit is OPEN and
 * the recovery window has not yet elapsed.
 */
function checkCircuitBreaker() {
  if (CIRCUIT_BREAKER.state === 'OPEN') {
    const elapsed = Date.now() - CIRCUIT_BREAKER.lastFailureTime;
    if (elapsed >= CIRCUIT_BREAKER.recoveryTimeMs) {
      CIRCUIT_BREAKER.state = 'HALF_OPEN';
      CIRCUIT_BREAKER.successCount = 0;
      console.log('[CIRCUIT BREAKER] NOAA API: HALF_OPEN — testing recovery');
      return; // Allow this request through as a probe
    }
    const waitSec = Math.ceil((CIRCUIT_BREAKER.recoveryTimeMs - elapsed) / 1000);
    throw new Error(
      `[CIRCUIT BREAKER] NOAA API circuit is OPEN — retry in ${waitSec}s`
    );
  }
}

/**
 * Record a successful requestWithRetry completion.
 */
function recordCircuitSuccess() {
  if (CIRCUIT_BREAKER.state === 'HALF_OPEN') {
    CIRCUIT_BREAKER.successCount++;
    if (CIRCUIT_BREAKER.successCount >= CIRCUIT_BREAKER.halfOpenSuccessThreshold) {
      CIRCUIT_BREAKER.state = 'CLOSED';
      CIRCUIT_BREAKER.failureCount = 0;
      CIRCUIT_BREAKER.successCount = 0;
      console.log('[CIRCUIT BREAKER] NOAA API: CLOSED — service recovered');
    }
  } else {
    // Reset failure count on any success while CLOSED
    CIRCUIT_BREAKER.failureCount = 0;
  }
}

/**
 * Record a failed requestWithRetry call (all retries exhausted).
 */
function recordCircuitFailure() {
  CIRCUIT_BREAKER.failureCount++;
  CIRCUIT_BREAKER.lastFailureTime = Date.now();

  if (CIRCUIT_BREAKER.state === 'HALF_OPEN') {
    CIRCUIT_BREAKER.state = 'OPEN';
    console.error('[CIRCUIT BREAKER] NOAA API: back to OPEN — half-open probe failed');
  } else if (
    CIRCUIT_BREAKER.state === 'CLOSED' &&
    CIRCUIT_BREAKER.failureCount >= CIRCUIT_BREAKER.failureThreshold
  ) {
    CIRCUIT_BREAKER.state = 'OPEN';
    console.error(
      `[CIRCUIT BREAKER] NOAA API: OPEN after ${CIRCUIT_BREAKER.failureCount} consecutive failures`
    );
  }
}

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
  checkCircuitBreaker();  // Throws immediately if circuit is OPEN

  let lastError;
  let delay = RETRY_CONFIG.initialDelayMs;

  for (let attempt = 1; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      await enforceRateLimit();
      const result = await requestFn();
      recordCircuitSuccess();
      return result;
    } catch (error) {
      lastError = error;

      if (!isRetryable(error) || attempt === RETRY_CONFIG.maxRetries) {
        // Only trip the circuit breaker when we've genuinely exhausted retries
        // on a server-side problem. Non-retryable errors (4xx) are client errors
        // and should not open the circuit.
        if (attempt === RETRY_CONFIG.maxRetries && isRetryable(error)) {
          recordCircuitFailure();
        }
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
  getCircuitBreakerState,
  // Export for testing
  _internal: {
    requestWithRetry,
    enforceRateLimit,
    isRetryable
  }
};
