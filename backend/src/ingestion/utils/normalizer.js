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
 * Calculate operational status based on advisory severity
 * @param {string} severity - Advisory severity
 * @param {string} advisoryType - Type of advisory
 * @returns {string} Operational status (Open, At Risk, Closed)
 */
function calculateOperationalStatus(severity, advisoryType) {
  const type = advisoryType.toLowerCase();
  
  // Immediate closures
  if (severity === 'Extreme') {
    if (type.includes('hurricane warning') || 
        type.includes('tornado emergency') ||
        type.includes('evacuation')) {
      return 'Closed';
    }
    return 'At Risk';
  }
  
  if (severity === 'Severe') {
    if (type.includes('blizzard warning') ||
        type.includes('ice storm warning') ||
        type.includes('extreme wind warning')) {
      return 'At Risk';
    }
    return 'At Risk';
  }
  
  if (severity === 'Moderate') {
    return 'At Risk';
  }
  
  return 'Open';
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
  isPointInAlertArea,
  calculateOperationalStatus,
  formatStatusReason
};
