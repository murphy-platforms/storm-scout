/**
 * NOAA Weather Data Ingestor
 * Fetches weather alerts from NOAA and updates database
 */

const { getNOAAAlerts } = require('./utils/api-client');
const { normalizeNOAAAlert, calculateOperationalStatus, formatStatusReason } = require('./utils/normalizer');
const SiteModel = require('../models/site');
const AdvisoryModel = require('../models/advisory');
const SiteStatusModel = require('../models/siteStatus');
const { removeExpiredAdvisories } = require('../utils/cleanup-advisories');

/**
 * Main ingestion function for NOAA weather data
 */
async function ingestNOAAData() {
  console.log('\n═══ NOAA Weather Data Ingestion Started ═══');
  console.log(`Time: ${new Date().toISOString()}\n`);
  
  try {
    // Step 1: Fetch all active NOAA alerts
    const noaaAlerts = await getNOAAAlerts();
    
    if (noaaAlerts.length === 0) {
      console.log('No active weather alerts from NOAA');
      // Mark all existing advisories as expired if no alerts
      const expired = await AdvisoryModel.markExpired();
      console.log(`Marked ${expired} expired advisories`);
      return;
    }
    
    // Step 2: Get all sites
    const sites = await SiteModel.getAll();
    console.log(`Processing ${sites.length} sites...`);
    
    // Step 3: Match alerts to sites
    const siteAdvisories = new Map();
    
    for (const alert of noaaAlerts) {
      const properties = alert.properties;
      
      // Skip if not affecting our areas
      if (!properties.affectedZones || properties.affectedZones.length === 0) {
        continue;
      }
      
      // Find sites in affected areas
      // NOAA provides state codes in geocode.SAME field
      const affectedStates = extractStatesFromAlert(properties);
      
      for (const site of sites) {
        // Simple matching: if site's state is in affected states
        if (affectedStates.includes(site.state)) {
          if (!siteAdvisories.has(site.id)) {
            siteAdvisories.set(site.id, []);
          }
          
          const normalized = normalizeNOAAAlert(alert);
          normalized.site_id = site.id;
          siteAdvisories.get(site.id).push(normalized);
        }
      }
    }
    
    console.log(`Matched alerts to ${siteAdvisories.size} sites\n`);
    
    // Step 4: Update database
    let advisoriesCreated = 0;
    let statusesUpdated = 0;
    
    // First, mark all existing advisories as expired
    await AdvisoryModel.markExpired();
    
    // Create new advisories and update site statuses
    for (const [siteId, advisories] of siteAdvisories.entries()) {
      // Create advisories
      for (const advisory of advisories) {
        try {
          await AdvisoryModel.create(advisory);
          advisoriesCreated++;
        } catch (error) {
          console.error(`Error creating advisory for site ${siteId}:`, error.message);
        }
      }
      
      // Update site status based on most severe advisory
      const mostSevere = advisories.reduce((max, adv) => {
        const severityOrder = { 'Extreme': 4, 'Severe': 3, 'Moderate': 2, 'Minor': 1, 'Unknown': 0 };
        return (severityOrder[adv.severity] || 0) > (severityOrder[max.severity] || 0) ? adv : max;
      });
      
      const operationalStatus = calculateOperationalStatus(mostSevere.severity, mostSevere.advisory_type);
      const reason = formatStatusReason(advisories);
      
      try {
        await SiteStatusModel.upsert(siteId, operationalStatus, reason);
        statusesUpdated++;
      } catch (error) {
        console.error(`Error updating status for site ${siteId}:`, error.message);
      }
    }
    
    // Update sites with no advisories to Open status
    for (const site of sites) {
      if (!siteAdvisories.has(site.id)) {
        try {
          await SiteStatusModel.upsert(site.id, 'Open', 'No active advisories');
        } catch (error) {
          console.error(`Error updating status for site ${site.id}:`, error.message);
        }
      }
    }
    
    // Step 5: Clean up expired advisories
    console.log('\nCleaning up expired advisories...');
    const expiredRemoved = await removeExpiredAdvisories();
    
    console.log('\n═══ Ingestion Complete ═══');
    console.log(`Advisories created: ${advisoriesCreated}`);
    console.log(`Site statuses updated: ${statusesUpdated}`);
    console.log(`Expired advisories removed: ${expiredRemoved}`);
    console.log(`═══════════════════════════\n`);
    
  } catch (error) {
    console.error('\n✗ NOAA ingestion failed:', error.message);
    throw error;
  }
}

/**
 * Extract state codes from NOAA alert properties
 * @param {Object} properties - NOAA alert properties
 * @returns {Array} Array of state codes
 */
function extractStatesFromAlert(properties) {
  const states = new Set();
  
  // Extract from areaDesc (e.g., "Florida Keys; Monroe County")
  if (properties.areaDesc) {
    const stateNames = properties.areaDesc.split(';').map(s => s.trim());
    stateNames.forEach(name => {
      const state = stateNameToCode(name);
      if (state) states.add(state);
    });
  }
  
  // Extract from geocode.UGC (e.g., ["FLZ076", "FLZ077"])
  if (properties.geocode && properties.geocode.UGC) {
    properties.geocode.UGC.forEach(code => {
      // UGC codes start with 2-letter state code
      const stateCode = code.substring(0, 2);
      states.add(stateCode);
    });
  }
  
  return Array.from(states);
}

/**
 * Convert state name to 2-letter code
 * @param {string} name - State name or partial name
 * @returns {string|null} State code or null
 */
function stateNameToCode(name) {
  const lowerName = name.toLowerCase();
  
  // Map of state names to codes (partial list - expand as needed)
  const stateMap = {
    'florida': 'FL', 'california': 'CA', 'texas': 'TX', 'new york': 'NY',
    'illinois': 'IL', 'pennsylvania': 'PA', 'ohio': 'OH', 'georgia': 'GA',
    'michigan': 'MI', 'north carolina': 'NC', 'new jersey': 'NJ', 'virginia': 'VA',
    'washington': 'WA', 'arizona': 'AZ', 'massachusetts': 'MA', 'tennessee': 'TN',
    'indiana': 'IN', 'missouri': 'MO', 'maryland': 'MD', 'wisconsin': 'WI',
    'colorado': 'CO', 'minnesota': 'MN', 'south carolina': 'SC', 'alabama': 'AL',
    'louisiana': 'LA', 'kentucky': 'KY', 'oregon': 'OR', 'oklahoma': 'OK',
    'connecticut': 'CT', 'utah': 'UT', 'iowa': 'IA', 'nevada': 'NV',
    'arkansas': 'AR', 'mississippi': 'MS', 'kansas': 'KS', 'new mexico': 'NM',
    'nebraska': 'NE', 'west virginia': 'WV', 'idaho': 'ID', 'hawaii': 'HI',
    'new hampshire': 'NH', 'maine': 'ME', 'montana': 'MT', 'rhode island': 'RI',
    'delaware': 'DE', 'south dakota': 'SD', 'north dakota': 'ND', 'alaska': 'AK',
    'vermont': 'VT', 'wyoming': 'WY'
  };
  
  for (const [stateName, code] of Object.entries(stateMap)) {
    if (lowerName.includes(stateName)) {
      return code;
    }
  }
  
  return null;
}

module.exports = {
  ingestNOAAData
};
