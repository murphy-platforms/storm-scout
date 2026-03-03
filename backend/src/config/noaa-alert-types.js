/**
 * NOAA Weather Alert Types Configuration
 * Based on National Weather Service alert taxonomy
 * https://www.weather.gov/help-map
 */

/**
 * Alert type categories with impact levels for filtering
 * Impact levels: CRITICAL, HIGH, MODERATE, LOW, INFO
 */
const NOAA_ALERT_TYPES = {
  // CRITICAL - Immediate threat to life/property
  CRITICAL: [
    'Tornado Warning',
    'Severe Thunderstorm Warning',
    'Flash Flood Warning',
    'Hurricane Warning',
    'Typhoon Warning',
    'Extreme Wind Warning',
    'Storm Surge Warning',
    'Tsunami Warning',
    'Blizzard Warning',
    'Ice Storm Warning',
    'Dust Storm Warning',
    'Avalanche Warning',
    'Snow Squall Warning'
  ],

  // HIGH - Significant threat requiring preparation/action
  HIGH: [
    'Tornado Watch',
    'Severe Thunderstorm Watch',
    'Hurricane Watch',
    'Typhoon Watch',
    'Flood Warning',
    'Winter Storm Warning',
    'High Wind Warning',
    'Excessive Heat Warning',
    'Extreme Cold Warning',
    'Red Flag Warning',
    'Fire Warning',
    'Tropical Storm Warning',
    'Storm Warning',
    'Gale Warning',
    'Heavy Freezing Spray Warning',
    'Storm Surge Watch',
    'Flash Flood Watch'
  ],

  // MODERATE - Notable conditions requiring awareness
  MODERATE: [
    'Flood Watch',
    'Winter Storm Watch',
    'Winter Weather Advisory',
    'Wind Advisory',
    'Heat Advisory',
    'Dense Fog Advisory',
    'Freeze Warning',
    'Frost Advisory',
    'Lake Effect Snow Warning',
    'Lake Effect Snow Watch',
    'Blowing Dust Advisory',
    'Tropical Storm Watch',
    'High Wind Watch',
    'High Surf Warning',
    'Coastal Flood Warning',
    'Coastal Flood Watch',
    'Lakeshore Flood Warning',
    'Lakeshore Flood Watch',
    'Excessive Heat Watch',
    'Hard Freeze Warning',
    'Freeze Watch',
    'Extreme Cold Watch',
    'Lake Wind Advisory'
  ],

  // LOW - Minor conditions or precautionary information
  LOW: [
    'Wind Chill Advisory',
    'Wind Chill Watch',
    'Small Craft Advisory',
    'Brisk Wind Advisory',
    'Hazardous Seas Warning',
    'High Surf Advisory',
    'Coastal Flood Advisory',
    'Lakeshore Flood Advisory',
    'Flood Advisory',
    'Beach Hazards Statement',
    'Rip Current Statement',
    'Cold Weather Advisory',
    'Freezing Fog Advisory',
    'Ashfall Advisory',
    'Air Quality Alert',
    'Dense Smoke Advisory',
    'Coastal Flood Statement',
    'Lakeshore Flood Statement',
    'Flood Statement',
    'Flash Flood Statement',
    'Low Water Advisory',
    'Air Stagnation Advisory',
    'Freezing Spray Advisory'
  ],

  // INFO - Informational statements
  INFO: [
    'Special Weather Statement',
    'Marine Weather Statement',
    'Hydrologic Outlook',
    'Hazardous Weather Outlook',
    'Short Term Forecast',
    'Administrative Message',
    'Test',
    'Test Message',
    'Child Abduction Emergency',
    'Civil Danger Warning',
    'Civil Emergency Message',
    'Avalanche Watch',
    'Avalanche Advisory',
    'Fire Weather Watch',
    'Severe Weather Statement',
    'Tropical Cyclone Local Statement',
    'Tsunami Advisory',
    'Tsunami Watch'
  ]
};

/**
 * Default filter configuration for different user personas
 */
const DEFAULT_FILTERS = {
  // Custom - Site-specific configuration (default)
  // Enables all CRITICAL, all HIGH, and key MODERATE types for land-based operations.
  // LOW and INFO categories are excluded via includeCategories (not listed here).
  CUSTOM: {
    name: 'Site Default',
    description: 'Customized alert configuration for testing center operations',
    includeCategories: ['CRITICAL', 'HIGH', 'MODERATE'],
    excludeTypes: [
      // MODERATE exclusions — coastal/lakeshore/surf not relevant to most inland sites
      'Blowing Dust Advisory',
      'High Surf Warning',
      'Coastal Flood Warning',
      'Coastal Flood Watch',
      'Lakeshore Flood Warning',
      'Lakeshore Flood Watch'
    ]
  },

  // Operations - Show anything that could impact site operations
  OPERATIONS: {
    name: 'Operations View',
    description: 'Critical and high-impact alerts that may affect site operations',
    includeCategories: ['CRITICAL', 'HIGH', 'MODERATE'],
    excludeTypes: ['Special Weather Statement', 'Marine Weather Statement']
  },

  // Executive - Only show critical situations
  EXECUTIVE: {
    name: 'Executive Summary',
    description: 'Only critical alerts requiring immediate attention',
    includeCategories: ['CRITICAL'],
    excludeTypes: []
  },

  // Safety - Show anything affecting personnel safety
  SAFETY: {
    name: 'Safety Focus',
    description: 'All alerts that could affect personnel safety',
    includeCategories: ['CRITICAL', 'HIGH', 'MODERATE', 'LOW'],
    excludeTypes: ['Marine Weather Statement', 'Special Weather Statement', 'Test']
  },

  // Full - Show everything
  FULL: {
    name: 'All Alerts',
    description: 'Display all weather alerts and statements',
    includeCategories: ['CRITICAL', 'HIGH', 'MODERATE', 'LOW', 'INFO'],
    excludeTypes: ['Test', 'Administrative Message']
  }
};

/**
 * Get impact level for a given alert type
 * @param {string} alertType - NOAA alert type
 * @returns {string|null} Impact level or null if not found
 */
function getImpactLevel(alertType) {
  for (const [level, types] of Object.entries(NOAA_ALERT_TYPES)) {
    if (types.includes(alertType)) {
      return level;
    }
  }
  return null;
}

/**
 * Check if alert type should be included based on filter
 * @param {string} alertType - NOAA alert type
 * @param {string} filterName - Filter preset name (OPERATIONS, EXECUTIVE, etc.)
 * @returns {boolean} True if alert should be included
 */
function shouldIncludeAlert(alertType, filterName = 'OPERATIONS') {
  const filter = DEFAULT_FILTERS[filterName];
  if (!filter) return true; // If unknown filter, include everything

  // Check if explicitly excluded
  if (filter.excludeTypes.includes(alertType)) {
    return false;
  }

  // Check if impact level is included
  const impactLevel = getImpactLevel(alertType);
  if (!impactLevel) return true; // Unknown types default to included

  return filter.includeCategories.includes(impactLevel);
}

/**
 * Get all alert types for a given impact level
 * @param {string} level - Impact level (CRITICAL, HIGH, MODERATE, LOW, INFO)
 * @returns {Array} Array of alert type names
 */
function getAlertTypesByLevel(level) {
  return NOAA_ALERT_TYPES[level] || [];
}

/**
 * Get filter configuration
 * @param {string} filterName - Filter preset name
 * @returns {Object|null} Filter configuration or null
 */
function getFilterConfig(filterName) {
  return DEFAULT_FILTERS[filterName] || null;
}

/**
 * Get all available filter presets
 * @returns {Object} All filter configurations
 */
function getAllFilters() {
  return DEFAULT_FILTERS;
}

module.exports = {
  NOAA_ALERT_TYPES,
  DEFAULT_FILTERS,
  getImpactLevel,
  shouldIncludeAlert,
  getAlertTypesByLevel,
  getFilterConfig,
  getAllFilters
};
