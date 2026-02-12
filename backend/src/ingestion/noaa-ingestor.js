/**
 * NOAA Weather Data Ingestor
 * Fetches weather alerts from NOAA and updates database
 */

const fs = require('fs');
const path = require('path');
const { getNOAAAlerts } = require('./utils/api-client');
const { normalizeNOAAAlert, calculateOperationalStatus, formatStatusReason } = require('./utils/normalizer');
const SiteModel = require('../models/site');
const AdvisoryModel = require('../models/advisory');
const SiteStatusModel = require('../models/siteStatus');
const { removeExpiredAdvisories } = require('../utils/cleanup-advisories');

const LAST_INGESTION_FILE = path.join(__dirname, '../../.last-ingestion.json');

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
    
    // Step 3.5: De-duplicate advisories - keep only most severe of each type per site
    console.log('De-duplicating advisories by type per site...');
    const severityOrder = { 'Extreme': 4, 'Severe': 3, 'Moderate': 2, 'Minor': 1, 'Unknown': 0 };
    let beforeDedup = 0;
    let afterDedup = 0;
    
    for (const [siteId, advisories] of siteAdvisories.entries()) {
      beforeDedup += advisories.length;
      
      // Group by advisory type
      const byType = new Map();
      for (const advisory of advisories) {
        const type = advisory.advisory_type;
        if (!byType.has(type)) {
          byType.set(type, []);
        }
        byType.get(type).push(advisory);
      }
      
      // Keep only the most severe of each type (or most recent if same severity)
      const deduplicated = [];
      for (const [type, typeAdvisories] of byType.entries()) {
        const mostSevere = typeAdvisories.reduce((best, current) => {
          const bestSeverity = severityOrder[best.severity] || 0;
          const currentSeverity = severityOrder[current.severity] || 0;
          
          // If same severity, prefer the one with later issued_time
          if (bestSeverity === currentSeverity) {
            const bestTime = new Date(best.issued_time || 0);
            const currentTime = new Date(current.issued_time || 0);
            return currentTime > bestTime ? current : best;
          }
          
          return currentSeverity > bestSeverity ? current : best;
        });
        deduplicated.push(mostSevere);
      }
      
      siteAdvisories.set(siteId, deduplicated);
      afterDedup += deduplicated.length;
    }
    
    console.log(`Before de-duplication: ${beforeDedup} advisories`);
    console.log(`After de-duplication: ${afterDedup} advisories`);
    console.log(`Removed ${beforeDedup - afterDedup} logical duplicates (same type, different zones)\n`);
    
    // Step 4: Update database
    let advisoriesCreated = 0;
    let statusesUpdated = 0;
    const processedExternalIds = [];
    
    // Create/update advisories and track processed external IDs
    for (const [siteId, advisories] of siteAdvisories.entries()) {
      // Create/update advisories
      for (const advisory of advisories) {
        try {
          await AdvisoryModel.create(advisory);
          advisoriesCreated++;
          
          // Track external_id for later cleanup
          if (advisory.external_id) {
            processedExternalIds.push(advisory.external_id);
          }
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
    
    // Step 5: Mark advisories not in current batch as expired
    console.log('\nMarking missing advisories as expired...');
    const { getDatabase } = require('../config/database');
    const db = await getDatabase();
    let expiredCount = 0;
    
    if (processedExternalIds.length > 0) {
      const [result] = await db.query(`
        UPDATE advisories
        SET status = 'expired', last_updated = CURRENT_TIMESTAMP
        WHERE status = 'active' 
          AND external_id IS NOT NULL
          AND external_id NOT IN (?)
      `, [processedExternalIds]);
      expiredCount = result.affectedRows;
      console.log(`Marked ${expiredCount} advisories as expired`);
    }
    
    // Step 6: Clean up expired advisories (remove old ones)
    console.log('\nCleaning up old expired advisories...');
    const expiredRemoved = await removeExpiredAdvisories();
    
    // Step 7: Check for sites with unusually high advisory counts (monitoring)
    console.log('\nChecking for anomalies...');
    const [highCountSites] = await db.query(`
      SELECT s.site_code, s.name, s.state, COUNT(*) as advisory_count
      FROM advisories a
      JOIN sites s ON a.site_id = s.id
      WHERE a.status = 'active'
      GROUP BY s.id
      HAVING advisory_count > 15
      ORDER BY advisory_count DESC
      LIMIT 5
    `);
    
    if (highCountSites.length > 0) {
      console.warn('⚠️  WARNING: Sites with unusually high advisory counts detected:');
      highCountSites.forEach(site => {
        console.warn(`   ${site.site_code} (${site.name}, ${site.state}): ${site.advisory_count} active advisories`);
      });
      console.warn('   This may indicate duplicate accumulation. Consider running cleanup.');
    } else {
      console.log('✓ No anomalies detected');
    }
    
    // Save timestamp of successful ingestion
    const timestamp = new Date().toISOString();
    fs.writeFileSync(LAST_INGESTION_FILE, JSON.stringify({ lastUpdated: timestamp }));
    
    console.log('\n═══ Ingestion Complete ═══');
    console.log(`Advisories created/updated: ${advisoriesCreated}`);
    console.log(`Site statuses updated: ${statusesUpdated}`);
    console.log(`Advisories marked expired: ${expiredCount}`);
    console.log(`Old expired removed: ${expiredRemoved}`);
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

/**
 * Get last ingestion timestamp
 * @returns {Object|null} {lastUpdated: ISO string} or null if never run
 */
function getLastIngestionTime() {
  try {
    if (fs.existsSync(LAST_INGESTION_FILE)) {
      const data = fs.readFileSync(LAST_INGESTION_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error reading last ingestion time:', error);
  }
  return null;
}

module.exports = {
  ingestNOAAData,
  getLastIngestionTime
};
