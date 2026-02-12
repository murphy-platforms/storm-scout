/**
 * Data Normalizer
 * Normalizes weather data from various sources into our schema
 */

/**
 * Map NOAA severity to our severity levels
 * @param {string} noaaSeverity - NOAA severity (Extreme, Severe, Moderate, Minor, Unknown)
 * @returns {string} Normalized severity
 */
function normalizeSeverity(noaaSeverity) {
  if (!noaaSeverity) return 'Unknown';
  
  const severity = noaaSeverity.toLowerCase();
  const map = {
    'extreme': 'Extreme',
    'severe': 'Severe',
    'moderate': 'Moderate',
    'minor': 'Minor',
    'unknown': 'Unknown'
  };
  
  return map[severity] || 'Unknown';
}

/**
 * Extract VTEC (Valid Time Event Code) from NOAA alert
 * VTEC format: /O.CON.PAJK.WS.W.0005.000000T0000Z-260213T0000Z/
 * The event number (0005) stays consistent across all updates for the same weather event
 * @param {Object} noaaAlert - NOAA alert feature object
 * @returns {string|null} VTEC code or null if not found
 */
function extractVTEC(noaaAlert) {
  try {
    const properties = noaaAlert.properties;
    const vtecArray = properties?.parameters?.VTEC;
    
    if (vtecArray && Array.isArray(vtecArray) && vtecArray.length > 0) {
      // Return the first (primary) VTEC code
      // Some alerts have multiple VTEC codes, but the first is the primary event
      return vtecArray[0];
    }
  } catch (error) {
    console.error('Failed to extract VTEC from alert:', error.message);
  }
  
  return null;
}

/**
 * Normalize NOAA alert to our advisory schema
 * @param {Object} noaaAlert - NOAA alert feature object
 * @returns {Object} Normalized advisory data
 */
function normalizeNOAAAlert(noaaAlert) {
  const properties = noaaAlert.properties;
  
  return {
    advisory_type: properties.event || 'Weather Advisory',
    severity: normalizeSeverity(properties.severity),
    status: properties.status === 'Actual' ? 'active' : 'expired',
    source: `NOAA/${properties.senderName || 'NWS'}`,
    headline: properties.headline || properties.event,
    description: properties.description || '',
    start_time: properties.onset || properties.effective || new Date().toISOString(),
    end_time: properties.ends || properties.expires,
    issued_time: properties.sent || new Date().toISOString(),
    vtec_code: extractVTEC(noaaAlert),
    raw_payload: noaaAlert
  };
}

/**
 * Check if coordinates are within alert area
 * Simple check - in production you'd use proper polygon checking
 * @param {number} lat - Site latitude
 * @param {number} lon - Site longitude
 * @param {Object} alertGeometry - NOAA alert geometry
 * @returns {boolean} Whether site is in alert area
 */
function isPointInAlertArea(lat, lon, alertGeometry) {
  // Simplified check - NOAA alerts cover large areas
  // In production, implement proper polygon containment check
  // For now, we'll use the affectedZones from the alert properties
  return true; // Conservative approach - include all alerts
}

/**
 * Calculate weather impact level based on advisory severity
 * Automatic assessment - does NOT set operational status
 * @param {string} severity - Advisory severity (Extreme, Severe, Moderate, Minor, Unknown)
 * @returns {string} Weather impact level (red, orange, yellow, green)
 */
function calculateWeatherImpact(severity) {
  // Map severity to weather impact color
  const impactMap = {
    'Extreme': 'red',      // CRITICAL - life-threatening conditions
    'Severe': 'orange',     // HIGH - significant hazardous conditions
    'Moderate': 'yellow',   // MODERATE - notable weather conditions
    'Minor': 'green',       // LOW/MINIMAL - minor conditions
    'Unknown': 'green'      // Default to green when severity unknown
  };
  
  return impactMap[severity] || 'green';
}

/**
 * Calculate highest weather impact from multiple advisories
 * @param {Array} advisories - Array of advisory objects with severity field
 * @returns {string} Highest weather impact level (red, orange, yellow, green)
 */
function calculateHighestWeatherImpact(advisories) {
  if (!advisories || advisories.length === 0) {
    return 'green';
  }
  
  // Priority order (highest to lowest)
  const impactOrder = ['red', 'orange', 'yellow', 'green'];
  
  const impacts = advisories.map(adv => calculateWeatherImpact(adv.severity));
  
  for (const impact of impactOrder) {
    if (impacts.includes(impact)) {
      return impact;
    }
  }
  
  return 'green';
}

/**
 * Format reason text for site status
 * @param {Array} advisories - Array of active advisories
 * @returns {string} Formatted reason text
 */
function formatStatusReason(advisories) {
  if (!advisories || advisories.length === 0) {
    return 'No active advisories';
  }
  
  const highestSeverity = advisories.reduce((max, adv) => {
    const severityOrder = { 'Extreme': 4, 'Severe': 3, 'Moderate': 2, 'Minor': 1, 'Unknown': 0 };
    return (severityOrder[adv.severity] || 0) > (severityOrder[max.severity] || 0) ? adv : max;
  });
  
  if (advisories.length === 1) {
    return highestSeverity.advisory_type;
  }
  
  return `${highestSeverity.advisory_type} + ${advisories.length - 1} more`;
}

module.exports = {
  normalizeSeverity,
  normalizeNOAAAlert,
  extractVTEC,
  isPointInAlertArea,
  calculateWeatherImpact,
  calculateHighestWeatherImpact,
  formatStatusReason,
  // Legacy export for backward compatibility
  calculateOperationalStatus: calculateWeatherImpact
};
