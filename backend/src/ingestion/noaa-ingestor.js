/**
 * NOAA Weather Data Ingestor
 * Fetches weather alerts from NOAA and updates database
 * Features: transactions, UGC-level geo-matching, deduplication
 */

const fs = require('fs');
const path = require('path');
const { getNOAAAlerts, getLatestObservation } = require('./utils/api-client');
const { normalizeNOAAAlert, calculateWeatherImpact, calculateHighestWeatherImpact, formatStatusReason } = require('./utils/normalizer');
const SiteModel = require('../models/site');
const AdvisoryModel = require('../models/advisory');
const SiteStatusModel = require('../models/siteStatus');
const AdvisoryHistory = require('../models/advisoryHistory');
const { removeExpiredAdvisories } = require('../utils/cleanup-advisories');
const { alertAnomaly } = require('../utils/alerting');
const ObservationModel = require('../models/observation');
const cache = require('../utils/cache');

const LAST_INGESTION_FILE = path.join(__dirname, '../../.last-ingestion.json');

// Ingestion status tracking — exposed via getIngestionStatus()
let isIngesting = false;
let ingestionStartedAt = null;

/**
 * Return current ingestion status (consumed by /health endpoint)
 * @returns {Object} { active: boolean, startedAt: string|null }
 */
function getIngestionStatus() {
  return {
    active: isIngesting,
    startedAt: ingestionStartedAt
  };
}

/**
 * Main ingestion function for NOAA weather data
 */
async function ingestNOAAData() {
  console.log('\n═══ NOAA Weather Data Ingestion Started ═══');
  console.log(`Time: ${new Date().toISOString()}\n`);
  
  isIngesting = true;
  ingestionStartedAt = new Date().toISOString();
  
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
    
    // Step 2: Get all sites with their UGC codes for matching
    const sites = await SiteModel.getAll();
    console.log(`Processing ${sites.length} sites...`);
    
    // Build lookup maps for efficient matching
    const sitesByState = new Map();      // state -> [sites]
    const sitesByUGC = new Map();        // ugc_code -> [sites]
    const sitesByCounty = new Map();     // "state|county" -> [sites]
    
    for (const site of sites) {
      // Index by state
      if (!sitesByState.has(site.state)) {
        sitesByState.set(site.state, []);
      }
      sitesByState.get(site.state).push(site);
      
      // Index by UGC codes (if available)
      if (site.ugc_codes) {
        try {
          const ugcCodes = typeof site.ugc_codes === 'string' 
            ? JSON.parse(site.ugc_codes) 
            : site.ugc_codes;
          for (const ugc of ugcCodes) {
            if (!sitesByUGC.has(ugc)) {
              sitesByUGC.set(ugc, []);
            }
            sitesByUGC.get(ugc).push(site);
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
      
      // Index by county (state|county format for uniqueness)
      if (site.county) {
        const countyKey = `${site.state}|${site.county.toLowerCase()}`;
        if (!sitesByCounty.has(countyKey)) {
          sitesByCounty.set(countyKey, []);
        }
        sitesByCounty.get(countyKey).push(site);
      }
    }
    
    // Step 3: Match alerts to sites using hierarchical matching
    // Priority: UGC codes > County > State (most specific wins)
    const siteAdvisories = new Map();
    
    for (const alert of noaaAlerts) {
      const properties = alert.properties;
      
      // Skip if not affecting our areas
      if (!properties.affectedZones || properties.affectedZones.length === 0) {
        continue;
      }
      
      // Extract geographic identifiers from alert
      const { ugcCodes, counties, states } = extractGeoFromAlert(properties);
      const matchedSites = new Set();
      
      // Level 1: Match by UGC codes (most precise)
      for (const ugc of ugcCodes) {
        const sites = sitesByUGC.get(ugc) || [];
        sites.forEach(site => matchedSites.add(site));
      }
      
      // Level 2: Match by county (if no UGC matches for a site)
      if (matchedSites.size === 0) {
        for (const county of counties) {
          const sites = sitesByCounty.get(county) || [];
          sites.forEach(site => matchedSites.add(site));
        }
      }
      
      // Level 3: Fallback to state matching (least precise)
      // Only for sites WITHOUT UGC codes defined - sites with UGC codes
      // should only match alerts that explicitly include their zone/county
      if (matchedSites.size === 0) {
        for (const state of states) {
          const stateSites = sitesByState.get(state) || [];
          // Only add sites that don't have UGC codes (legacy fallback)
          stateSites
            .filter(site => !site.ugc_codes)
            .forEach(site => matchedSites.add(site));
        }
      }
      
      // Add alert to matched sites
      for (const site of matchedSites) {
        if (!siteAdvisories.has(site.id)) {
          siteAdvisories.set(site.id, []);
        }
        
        const normalized = normalizeNOAAAlert(alert);
        normalized.site_id = site.id;
        siteAdvisories.get(site.id).push(normalized);
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
    
    // Step 4: Update database with transaction
    let advisoriesCreated = 0;
    let statusesUpdated = 0;
    const processedExternalIds = [];
    
    const { getDatabase } = require('../config/database');
    const db = await getDatabase();
    const connection = await db.getConnection();
    
    try {
      await connection.beginTransaction();
      
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
            // Continue with other advisories - don't fail entire batch
          }
        }
        
        // Calculate weather impact based on most severe advisory
        const weatherImpactLevel = calculateHighestWeatherImpact(advisories);
        const reason = formatStatusReason(advisories);
        
        try {
          // Update ONLY weather_impact_level, do NOT change operational_status
          // Operational status is set manually by IMT/Operations
          await SiteStatusModel.upsert(siteId, {
            weather_impact_level: weatherImpactLevel,
            reason: reason,
            decision_by: 'weather_system'
          });
          statusesUpdated++;
        } catch (error) {
          console.error(`Error updating status for site ${siteId}:`, error.message);
        }
      }
      
      // Update sites with no advisories to green weather impact
      for (const site of sites) {
        if (!siteAdvisories.has(site.id)) {
          try {
            // Set weather impact to green (no advisories)
            await SiteStatusModel.upsert(site.id, {
              weather_impact_level: 'green',
              reason: 'No active advisories',
              decision_by: 'weather_system'
            });
          } catch (error) {
            console.error(`Error updating status for site ${site.id}:`, error.message);
          }
        }
      }
      
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    
    // Step 5: Mark advisories with passed end_time as expired
    console.log('\nMarking advisories with passed end_time as expired...');
    const [endTimeExpired] = await db.query(`
      UPDATE advisories
      SET status = 'expired', last_updated = NOW()
      WHERE status = 'active' 
        AND end_time IS NOT NULL 
        AND end_time < NOW()
    `);
    console.log(`Marked ${endTimeExpired.affectedRows} advisories as expired (end_time passed)`);
    
    // Step 6: Mark advisories not in current batch as expired
    console.log('\nMarking missing advisories as expired...');
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
    
    // Step 6: Create historical snapshots for trend analysis
    console.log('\nCreating historical snapshots...');
    try {
      const snapshotData = [];
      for (const [siteId, advisories] of siteAdvisories.entries()) {
        // Aggregate data for snapshot
        const severityRank = { 'Extreme': 4, 'Severe': 3, 'Moderate': 2, 'Minor': 1 };
        const highestSeverity = advisories.reduce((highest, adv) => {
          const rank = severityRank[adv.severity] || 0;
          const highestRank = severityRank[highest.severity] || 0;
          return rank > highestRank ? adv : highest;
        }, advisories[0]);
        
        const aggregated = {
          advisory_count: advisories.length,
          highest_severity: highestSeverity.severity,
          highest_severity_type: highestSeverity.advisory_type,
          has_extreme: advisories.some(a => a.severity === 'Extreme'),
          has_severe: advisories.some(a => a.severity === 'Severe'),
          has_moderate: advisories.some(a => a.severity === 'Moderate'),
          new_count: advisories.filter(a => a.vtec_action === 'NEW').length,
          upgrade_count: advisories.filter(a => a.vtec_action === 'UPG').length,
          advisories: advisories
        };
        
        snapshotData.push({ siteId, aggregated });
      }
      
      // Create all snapshots
      for (const { siteId, aggregated } of snapshotData) {
        await AdvisoryHistory.createSnapshot(siteId, aggregated);
      }
      console.log(`Created ${snapshotData.length} historical snapshots`);
    } catch (error) {
      console.error('Error creating snapshots:', error.message);
      // Don't fail ingestion if snapshot fails
    }
    
    // Step 7: Clean up expired advisories (remove old ones)
    console.log('\nCleaning up old expired advisories...');
    const expiredRemoved = await removeExpiredAdvisories();
    
    // Step 8: Check for sites with unusually high advisory counts (monitoring)
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
      const anomalyDetails = [];
      highCountSites.forEach(site => {
        console.warn(`   ${site.site_code} (${site.name}, ${site.state}): ${site.advisory_count} active advisories`);
        anomalyDetails.push({
          site_code: site.site_code,
          name: site.name,
          state: site.state,
          advisory_count: site.advisory_count
        });
      });
      console.warn('   This may indicate duplicate accumulation. Consider running cleanup.');
      
      // Send alert for anomaly
      await alertAnomaly(
        `${highCountSites.length} site(s) have unusually high advisory counts (>15)`,
        { sites: anomalyDetails }
      );
    } else {
      console.log('✓ No anomalies detected');
    }
    
    // Step 9: Ingest weather observations from nearest stations
    const observationResult = await ingestObservations(sites);
    
    // Invalidate cache to ensure fresh data is served
    cache.invalidateAll();
    
    // Save timestamp of successful ingestion
    const timestamp = new Date().toISOString();
    fs.writeFileSync(LAST_INGESTION_FILE, JSON.stringify({ lastUpdated: timestamp }));
    
    console.log('\n═══ Ingestion Complete ═══');
    console.log(`Advisories created/updated: ${advisoriesCreated}`);
    console.log(`Site statuses updated: ${statusesUpdated}`);
    console.log(`Advisories marked expired: ${expiredCount}`);
    console.log(`Old expired removed: ${expiredRemoved}`);
    console.log(`Observations updated: ${observationResult.updated}/${observationResult.total} sites (${observationResult.uniqueStations} unique stations)`);
    console.log(`═══════════════════════════\n`);
    
  } catch (error) {
    console.error('\n✗ NOAA ingestion failed:', error.message);
    throw error;
  } finally {
    isIngesting = false;
    ingestionStartedAt = null;
  }
}

/**
 * Ingest latest weather observations for all sites with mapped observation stations.
 * Deduplicates station fetches (multiple sites may share a station).
 * @param {Array} sites - All site objects from database
 * @returns {Object} { total, updated, failed, uniqueStations }
 */
async function ingestObservations(sites) {
  console.log('\n═══ Weather Observations Ingestion ═══');
  
  // Filter to sites with observation_station mapped
  const mappedSites = sites.filter(s => s.observation_station);
  
  if (mappedSites.length === 0) {
    console.log('No sites have observation stations mapped. Run fetch-observation-stations.js first.');
    return { total: 0, updated: 0, failed: 0, uniqueStations: 0 };
  }
  
  // Build station -> sites mapping to deduplicate fetches
  const stationToSites = new Map();
  for (const site of mappedSites) {
    const station = site.observation_station;
    if (!stationToSites.has(station)) {
      stationToSites.set(station, []);
    }
    stationToSites.get(station).push(site);
  }
  
  const uniqueStations = stationToSites.size;
  console.log(`${mappedSites.length} sites mapped to ${uniqueStations} unique stations`);
  
  let updated = 0;
  let failed = 0;
  
  for (const [stationId, stationSites] of stationToSites.entries()) {
    try {
      const obs = await getLatestObservation(stationId);
      
      if (!obs) {
        console.warn(`  Station ${stationId}: No observation data`);
        failed += stationSites.length;
        continue;
      }
      
      // Extract values from NWS response format { unitCode, value, qualityControl }
      const data = {
        station_id: stationId,
        temperature_c: obs.temperature?.value ?? null,
        relative_humidity: obs.relativeHumidity?.value ?? null,
        dewpoint_c: obs.dewpoint?.value ?? null,
        wind_speed_kmh: obs.windSpeed?.value ?? null,
        wind_direction_deg: obs.windDirection?.value != null ? Math.round(obs.windDirection.value) : null,
        wind_gust_kmh: obs.windGust?.value ?? null,
        barometric_pressure_pa: obs.barometricPressure?.value ?? null,
        visibility_m: obs.visibility?.value ?? null,
        wind_chill_c: obs.windChill?.value ?? null,
        heat_index_c: obs.heatIndex?.value ?? null,
        cloud_layers: obs.cloudLayers ? JSON.stringify(obs.cloudLayers) : null,
        text_description: obs.textDescription || null,
        observed_at: obs.timestamp ? new Date(obs.timestamp) : null
      };
      
      // Warn if observation is stale (older than 2 hours)
      if (data.observed_at) {
        const ageMinutes = (Date.now() - data.observed_at.getTime()) / 60000;
        if (ageMinutes > 120) {
          console.warn(`  ⚠️  Station ${stationId}: observation is ${Math.round(ageMinutes)} min old (stale)`);
        }
      }
      
      // Upsert for each site mapped to this station
      for (const site of stationSites) {
        try {
          await ObservationModel.upsert(site.id, data);
          updated++;
        } catch (dbError) {
          console.error(`  Error saving observation for site ${site.site_code}: ${dbError.message}`);
          failed++;
        }
      }
    } catch (error) {
      console.warn(`  Station ${stationId}: ${error.message}`);
      failed += stationSites.length;
    }
  }
  
  console.log(`Observations updated: ${updated}, failed: ${failed}`);
  return { total: mappedSites.length, updated, failed, uniqueStations };
}

/**
 * Extract geographic identifiers from NOAA alert properties
 * Returns UGC codes, county names, and state codes
 * @param {Object} properties - NOAA alert properties
 * @returns {Object} { ugcCodes: [], counties: [], states: [] }
 */
function extractGeoFromAlert(properties) {
  const ugcCodes = new Set();
  const counties = new Set();  // Format: "state|countyname"
  const states = new Set();
  
  // Extract from geocode.UGC (e.g., ["FLZ076", "FLZ077", "FLC087"])
  // This is the most precise identifier
  if (properties.geocode && properties.geocode.UGC) {
    properties.geocode.UGC.forEach(code => {
      ugcCodes.add(code);
      // Also extract state code from UGC
      const stateCode = code.substring(0, 2);
      states.add(stateCode);
    });
  }
  
  // Extract from areaDesc (e.g., "Monroe County, FL; Miami-Dade County, FL")
  // This gives us county names for secondary matching
  if (properties.areaDesc) {
    const areas = properties.areaDesc.split(';').map(s => s.trim());
    areas.forEach(area => {
      // Try to extract county name and state
      const countyMatch = area.match(/^(.+?)\s+County(?:,\s*([A-Z]{2}))?/i);
      if (countyMatch) {
        const countyName = countyMatch[1].toLowerCase();
        const state = countyMatch[2];
        if (state) {
          counties.add(`${state}|${countyName}`);
          states.add(state);
        }
      } else {
        // Try to extract state from area name
        const state = stateNameToCode(area);
        if (state) states.add(state);
      }
    });
  }
  
  // Extract from geocode.SAME (FIPS codes) - can derive state
  if (properties.geocode && properties.geocode.SAME) {
    properties.geocode.SAME.forEach(fips => {
      // SAME codes are 6 digits: first 2 are state FIPS
      // We could map these to states but UGC is more reliable
    });
  }
  
  return {
    ugcCodes: Array.from(ugcCodes),
    counties: Array.from(counties),
    states: Array.from(states)
  };
}

/**
 * Extract state codes from NOAA alert properties (legacy - for compatibility)
 * @param {Object} properties - NOAA alert properties
 * @returns {Array} Array of state codes
 */
function extractStatesFromAlert(properties) {
  const { states } = extractGeoFromAlert(properties);
  return states;
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
  getLastIngestionTime,
  getIngestionStatus
};
