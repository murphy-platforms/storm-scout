/**
 * Data Normalizer
 * Normalizes weather data from various sources into our schema
 */

const { NOAA_ALERT_TYPES } = require('../../config/noaa-alert-types');

/**
 * Convert any ISO 8601 datetime string to MySQL DATETIME format (UTC, no offset)
 * @param {string|null} isoString
 * @returns {string|null}
 */
function toMySQLDatetime(isoString) {
  if (!isoString) return null;
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Get severity based on internal alert type category (IMT operational alignment)
 * Maps our curated categories to severity levels:
 * - CRITICAL → Extreme (🔴 RED)
 * - HIGH → Severe (🟠 ORANGE)  
 * - MODERATE → Moderate (🟡 YELLOW)
 * - LOW/INFO → Minor (🟢 GREEN)
 * 
 * @param {string} alertType - The alert type name (e.g., "Winter Storm Warning")
 * @returns {string} Severity level based on internal category
 */
function getSeverityFromAlertType(alertType) {
  if (!alertType) return 'Minor';
  
  // Check each category for the alert type
  if (NOAA_ALERT_TYPES.CRITICAL && NOAA_ALERT_TYPES.CRITICAL.includes(alertType)) {
    return 'Extreme';
  }
  if (NOAA_ALERT_TYPES.HIGH && NOAA_ALERT_TYPES.HIGH.includes(alertType)) {
    return 'Severe';
  }
  if (NOAA_ALERT_TYPES.MODERATE && NOAA_ALERT_TYPES.MODERATE.includes(alertType)) {
    return 'Moderate';
  }
  if (NOAA_ALERT_TYPES.LOW && NOAA_ALERT_TYPES.LOW.includes(alertType)) {
    return 'Minor';
  }
  if (NOAA_ALERT_TYPES.INFO && NOAA_ALERT_TYPES.INFO.includes(alertType)) {
    return 'Minor';
  }
  
  // Unknown alert type - log and default to Minor
  console.warn(`Unknown alert type "${alertType}" not in categories, defaulting to Minor`);
  return 'Minor';
}

/**
 * Map NOAA severity to our severity levels (legacy - kept for reference)
 * @param {string} noaaSeverity - NOAA severity (Extreme, Severe, Moderate, Minor, Unknown)
 * @returns {string} Normalized severity (defaults to 'Minor' for unknown/invalid values)
 */
function normalizeSeverity(noaaSeverity) {
  if (!noaaSeverity) return 'Minor';
  
  const severity = noaaSeverity.toLowerCase();
  const validSeverities = {
    'extreme': 'Extreme',
    'severe': 'Severe',
    'moderate': 'Moderate',
    'minor': 'Minor'
  };
  
  const normalized = validSeverities[severity];
  if (!normalized) {
    console.warn(`Invalid severity "${noaaSeverity}" received, defaulting to Minor`);
    return 'Minor';
  }
  return normalized;
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
 * Extract VTEC event ID (persistent identifier across alert updates)
 * 
 * VTEC format: /O.{ACTION}.{OFFICE}.{PHENOM}.{SIG}.{EVENT}.{TIMES}/
 * Example: /O.CON.PAJK.HW.W.0006.260212T1200Z-260213T0300Z/
 * 
 * Event ID format: {OFFICE}.{PHENOM}.{SIG}.{EVENT}
 * Example: PAJK.HW.W.0006
 * 
 * This ID stays the same when NOAA issues updates (NEW→CON→EXT→EXP)
 * 
 * @param {string} vtecCode - Full VTEC code
 * @returns {string|null} Event ID (e.g., "PAJK.HW.W.0006") or null
 */
function extractVTECEventID(vtecCode) {
  if (!vtecCode) return null;
  
  try {
    // Parse: /O.{ACTION}.{OFFICE}.{PHENOM}.{SIG}.{EVENT}.{TIMES}/
    const match = vtecCode.match(/\/O\.\w+\.(\w+)\.(\w+)\.(\w)\.(\d+)\./);
    
    if (!match) return null;
    
    const [, office, phenomena, significance, eventNum] = match;
    return `${office}.${phenomena}.${significance}.${eventNum}`;
  } catch (error) {
    console.error('Failed to extract VTEC event ID:', error.message);
    return null;
  }
}

/**
 * Extract VTEC action code (alert status: NEW, CON, EXT, etc.)
 * 
 * Action codes:
 * - NEW: New alert issued
 * - CON: Continuation of existing alert
 * - EXT: Extension of alert time period
 * - EXP: Alert expired
 * - CAN: Alert cancelled
 * - UPG: Alert upgraded to higher severity
 * - EXA/EXB: Extended (A/B variants)
 * - ROU: Routine
 * - COR: Correction
 * 
 * @param {string} vtecCode - Full VTEC code
 * @returns {string|null} Action code (e.g., "NEW", "CON", "EXT") or null
 */
function extractVTECAction(vtecCode) {
  if (!vtecCode) return null;
  
  try {
    // Parse: /O.{ACTION}.{OFFICE}.../ 
    const match = vtecCode.match(/\/O\.(\w+)\./); 
    
    if (!match) return null;
    
    return match[1]; // Return the action code (NEW, CON, EXT, etc.)
  } catch (error) {
    console.error('Failed to extract VTEC action:', error.message);
    return null;
  }
}

/**
 * Normalize NOAA alert to our advisory schema
 * @param {Object} noaaAlert - NOAA alert feature object
 * @returns {Object} Normalized advisory data
 */
function normalizeNOAAAlert(noaaAlert) {
  const properties = noaaAlert.properties;
  const vtecCode = extractVTEC(noaaAlert);
  const alertType = properties.event || 'Weather Advisory';
  
  return {
    advisory_type: alertType,
    // Use internal category-based severity (IMT operational alignment)
    // instead of NOAA's raw severity field
    severity: getSeverityFromAlertType(alertType),
    status: properties.status === 'Actual' ? 'active' : 'expired',
    source: `NOAA/${properties.senderName || 'NWS'}`,
    headline: properties.headline || properties.event,
    description: properties.description || '',
    start_time: toMySQLDatetime(properties.onset || properties.effective || new Date().toISOString()),
    end_time: toMySQLDatetime(properties.ends || properties.expires),
    issued_time: toMySQLDatetime(properties.sent || new Date().toISOString()),
    vtec_code: vtecCode,
    vtec_event_id: extractVTECEventID(vtecCode),
    vtec_action: extractVTECAction(vtecCode),
    raw_payload: noaaAlert
  };
}

/**
 * Check if a point (lat/lon) falls within a GeoJSON polygon ring using ray-casting.
 * GeoJSON coordinates are [longitude, latitude] pairs.
 * @param {number} lat
 * @param {number} lon
 * @param {Array} ring - Array of [lon, lat] coordinate pairs (outer ring of a Polygon)
 * @returns {boolean}
 */
function pointInRing(lat, lon, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1]; // GeoJSON: [lon, lat]
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Check if coordinates fall within a NOAA alert's GeoJSON geometry.
 *
 * Architectural note: NOAA alert zones are authoritatively defined by UGC codes
 * (geocode.UGC), not by the polygon geometry. The GeoJSON shape is a visual
 * approximation of those zones. UGC/county/state string matching in the ingestor
 * is therefore the primary — and more accurate — matching mechanism.
 *
 * This function provides polygon containment as a secondary check, available for
 * offices that lack UGC codes or for callers that want geometric verification.
 * When geometry is absent, it returns true so UGC matching remains authoritative.
 *
 * @param {number} lat - Office latitude
 * @param {number} lon - Office longitude
 * @param {Object|null} alertGeometry - NOAA alert GeoJSON geometry object
 * @returns {boolean} True if point is inside the geometry, or if geometry is unavailable
 */
function isPointInAlertArea(lat, lon, alertGeometry) {
  // No geometry provided — defer to UGC/county/state matching (authoritative)
  if (!alertGeometry || !alertGeometry.type || !alertGeometry.coordinates) {
    return true;
  }

  if (alertGeometry.type === 'Polygon') {
    // coordinates[0] is the outer ring; subsequent rings are holes (ignored)
    return pointInRing(lat, lon, alertGeometry.coordinates[0]);
  }

  if (alertGeometry.type === 'MultiPolygon') {
    // Point is inside if it falls within any of the constituent polygons
    return alertGeometry.coordinates.some(polygon => pointInRing(lat, lon, polygon[0]));
  }

  // Unknown geometry type — fall back to inclusive (UGC matching decides)
  return true;
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
  extractVTECEventID,
  extractVTECAction,
  isPointInAlertArea,
  calculateWeatherImpact,
  calculateHighestWeatherImpact,
  formatStatusReason,
  getSeverityFromAlertType,
  // Legacy export for backward compatibility
  calculateOperationalStatus: calculateWeatherImpact
};
