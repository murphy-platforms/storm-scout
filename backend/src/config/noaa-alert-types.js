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
    'Avalanche Warning'
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
    'Red Flag Warning',
    'Fire Warning',
    'Tropical Storm Warning',
    'Storm Warning',
    'Gale Warning',
    'Heavy Freezing Spray Warning'
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
    'Blowing Dust Advisory',
    'Tropical Storm Watch',
    'High Surf Warning',
    'Coastal Flood Warning',
    'Lakeshore Flood Warning'
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
    'Beach Hazards Statement',
    'Rip Current Statement',
    'Cold Weather Advisory',
    'Freezing Fog Advisory',
    'Ashfall Advisory',
    'Air Quality Alert',
    'Dense Smoke Advisory'
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
    'Child Abduction Emergency',
    'Civil Danger Warning',
    'Civil Emergency Message',
    'Avalanche Watch',
    'Avalanche Advisory',
    'Fire Weather Watch'
  ]
};

/**
 * Default filter configuration for different user personas
 */
const DEFAULT_FILTERS = {
  // Custom - Site-specific configuration (default)
  CUSTOM: {
    name: 'Site Default',
    description: 'Customized alert configuration for testing center operations',
    includeCategories: ['CRITICAL', 'HIGH'],
    excludeTypes: [
      // CRITICAL exclusions (OFF by default)
      'Tornado Warning', 'Storm Surge Warning', 'Severe Thunderstorm Warning',
      'Dust Storm Warning', 'Extreme Wind Warning', 'Avalanche Warning',
      
      // HIGH exclusions (OFF by default)
      'Fire Warning', 'Gale Warning', 'High Wind Warning',
      'Severe Thunderstorm Watch', 'Red Flag Warning', 'Storm Warning',
      
      // All MODERATE excluded (entire category OFF)
      'Flood Watch', 'Winter Storm Watch', 'Winter Weather Advisory',
      'Wind Advisory', 'Heat Advisory', 'Dense Fog Advisory',
      'Freeze Warning', 'Frost Advisory', 'Lake Effect Snow Warning',
      'Blowing Dust Advisory', 'Tropical Storm Watch', 'High Surf Warning',
      'Coastal Flood Warning', 'Lakeshore Flood Warning',
      
      // All LOW excluded (entire category OFF)
      'Wind Chill Advisory', 'Wind Chill Watch', 'Small Craft Advisory',
      'Brisk Wind Advisory', 'Hazardous Seas Warning', 'High Surf Advisory',
      'Coastal Flood Advisory', 'Lakeshore Flood Advisory', 'Beach Hazards Statement',
      'Rip Current Statement', 'Cold Weather Advisory', 'Freezing Fog Advisory',
      'Ashfall Advisory', 'Air Quality Alert', 'Dense Smoke Advisory',
      
      // All INFO excluded (entire category OFF)
      'Special Weather Statement', 'Marine Weather Statement', 'Hydrologic Outlook',
      'Hazardous Weather Outlook', 'Short Term Forecast', 'Administrative Message',
      'Test', 'Child Abduction Emergency', 'Civil Danger Warning',
      'Civil Emergency Message', 'Avalanche Watch', 'Avalanche Advisory',
      'Fire Weather Watch'
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
