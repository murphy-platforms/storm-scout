/**
 * NOAA Weather Data Ingestor
 * Fetches weather alerts from NOAA and updates database
 * Features: transactions, UGC-level geo-matching, deduplication
 */

const fs = require('fs');
const path = require('path');
const { getNOAAAlerts, getLatestObservation } = require('./utils/api-client');
const { normalizeNOAAAlert, calculateWeatherImpact, calculateHighestWeatherImpact, formatStatusReason } = require('./utils/normalizer');
const OfficeModel = require('../models/office');
const AdvisoryModel = require('../models/advisory');
const OfficeStatusModel = require('../models/officeStatus');
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
    const offices = await OfficeModel.getAll();
    console.log(`Processing ${offices.length} offices...`);
    
    // Build lookup maps for efficient matching
    const officesByState = new Map();      // state -> [sites]
    const officesByUGC = new Map();        // ugc_code -> [sites]
    const officesByCounty = new Map();     // "state|county" -> [sites]
    
    for (const office of offices) {
      // Index by state
      if (!officesByState.has(office.state)) {
        officesByState.set(office.state, []);
      }
      officesByState.get(office.state).push(office);
      
      // Index by UGC codes (if available)
      if (office.ugc_codes) {
        try {
          const ugcCodes = typeof office.ugc_codes === 'string' 
            ? JSON.parse(office.ugc_codes) 
            : office.ugc_codes;
          for (const ugc of ugcCodes) {
            if (!officesByUGC.has(ugc)) {
              officesByUGC.set(ugc, []);
            }
            officesByUGC.get(ugc).push(office);
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
      
      // Index by county (state|county format for uniqueness)
      if (office.county) {
        const countyKey = `${office.state}|${office.county.toLowerCase()}`;
        if (!officesByCounty.has(countyKey)) {
          officesByCounty.set(countyKey, []);
        }
        officesByCounty.get(countyKey).push(office);
      }
    }
    
    // Step 3: Match alerts to sites using hierarchical matching
    // Priority: UGC codes > County > State (most specific wins)
    const officeAdvisories = new Map();
    
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
        const matchedByUGC = officesByUGC.get(ugc) || [];
        matchedByUGC.forEach(o => matchedSites.add(o));
      }
      
      // Level 2: Match by county (if no UGC matches for a site)
      if (matchedSites.size === 0) {
        for (const county of counties) {
          const matchedByCounty = officesByCounty.get(county) || [];
          matchedByCounty.forEach(o => matchedSites.add(o));
        }
      }
      
      // Level 3: Fallback to state matching (least precise)
      // Only for sites WITHOUT UGC codes defined - sites with UGC codes
      // should only match alerts that explicitly include their zone/county
      if (matchedSites.size === 0) {
        for (const state of states) {
          const stateOffices = officesByState.get(state) || [];
          // Only add sites that don't have UGC codes (legacy fallback)
          stateOffices
            .filter(o => !o.ugc_codes)
            .forEach(o => matchedSites.add(o));
        }
      }
      
      // Add alert to matched sites
      for (const office of matchedSites) {
        if (!officeAdvisories.has(office.id)) {
          officeAdvisories.set(office.id, []);
        }
        
        const normalized = normalizeNOAAAlert(alert);
        normalized.office_id = office.id;
        officeAdvisories.get(office.id).push(normalized);
      }
    }
    
    console.log(`Matched alerts to ${officeAdvisories.size} offices\n`);
    
    // Step 3.5: De-duplicate advisories - keep only most severe of each type per site
    console.log('De-duplicating advisories by type per site...');
    const severityOrder = { 'Extreme': 4, 'Severe': 3, 'Moderate': 2, 'Minor': 1, 'Unknown': 0 };
    let beforeDedup = 0;
    let afterDedup = 0;
    
    for (const [officeId, advisories] of officeAdvisories.entries()) {
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
      
      officeAdvisories.set(officeId, deduplicated);
      afterDedup += deduplicated.length;
    }
    
    console.log(`Before de-duplication: ${beforeDedup} advisories`);
    console.log(`After de-duplication: ${afterDedup} advisories`);
    console.log(`Removed ${beforeDedup - afterDedup} logical duplicates (same type, different zones)\n`);
    
    // Step 4: Update database with transaction
    let advisoriesCreated = 0;
    let advisoriesFailed = 0;
    let statusesUpdated = 0;
    let statusesFailed = 0;
    const processedExternalIds = [];
    
    const { getDatabase } = require('../config/database');
    const db = await getDatabase();
    const connection = await db.getConnection();
    
    try {
      await connection.beginTransaction();

      // Bulk pre-fetch all existing active advisories for the affected offices.
      // Runs inside the transaction on the same connection for read consistency.
      // Eliminates per-row SELECT queries in the insert loop (2 SELECTs × N → 1 query).
      const existingByExternalId = new Map();
      const existingByVtec = new Map();
      const affectedOfficeIds = Array.from(officeAdvisories.keys());

      if (affectedOfficeIds.length > 0) {
        const [existingRows] = await connection.query(
          `SELECT id, external_id, vtec_event_id, advisory_type, office_id
           FROM advisories
           WHERE office_id IN (?) AND status = 'active'`,
          [affectedOfficeIds]
        );
        for (const row of existingRows) {
          if (row.external_id) {
            existingByExternalId.set(`${row.external_id}|${row.office_id}`, row);
          }
          if (row.vtec_event_id) {
            existingByVtec.set(`${row.vtec_event_id}|${row.office_id}|${row.advisory_type}`, row);
          }
        }
        console.log(`Pre-fetched ${existingRows.length} existing advisories for ${affectedOfficeIds.length} offices`);
      }
      const existingLookup = { byExternalId: existingByExternalId, byVtec: existingByVtec };

      // Create/update advisories and track processed external IDs
      for (const [officeId, advisories] of officeAdvisories.entries()) {
        // Create/update advisories
        for (const advisory of advisories) {
          try {
            // Ensure advisory_type is registered — auto-inserts unknown NOAA types
            // with category='UNKNOWN' so the FK constraint is never violated
            await connection.query(
              'INSERT IGNORE INTO alert_types (type_name, category) VALUES (?, ?)',
              [advisory.advisory_type, 'UNKNOWN']
            );
            await AdvisoryModel.create(advisory, existingLookup);
            advisoriesCreated++;
            
            // Track external_id for later cleanup
            if (advisory.external_id) {
              processedExternalIds.push(advisory.external_id);
            }
          } catch (error) {
            console.error(`Error creating advisory for office ${officeId}:`, error.message);
            advisoriesFailed++;
          }
        }
        
        // Calculate weather impact based on most severe advisory
        const weatherImpactLevel = calculateHighestWeatherImpact(advisories);
        const reason = formatStatusReason(advisories);
        
        try {
          // Update ONLY weather_impact_level, do NOT change operational_status
          // Operational status is set manually by IMT/Operations
          await OfficeStatusModel.upsert(officeId, {
            weather_impact_level: weatherImpactLevel,
            reason: reason,
            decision_by: 'weather_system'
          });
          statusesUpdated++;
        } catch (error) {
          console.error(`Error updating status for office ${officeId}:`, error.message);
          statusesFailed++;
        }
      }

      // Update sites with no advisories to green weather impact
      for (const office of offices) {
        if (!officeAdvisories.has(office.id)) {
          try {
            // Set weather impact to green (no advisories)
            await OfficeStatusModel.upsert(office.id, {
              weather_impact_level: 'green',
              reason: 'No active advisories',
              decision_by: 'weather_system'
            });
          } catch (error) {
            console.error(`Error updating status for office ${office.id}:`, error.message);
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
    
    // Step 6: Mark advisories not in current batch as expired.
    // Chunked into 500-ID batches to avoid MySQL max_allowed_packet limits
    // and parser stress when advisory counts are high during major events.
    console.log('\nMarking missing advisories as expired...');
    let expiredCount = 0;

    if (processedExternalIds.length > 0) {
      const CHUNK_SIZE = 500;
      for (let i = 0; i < processedExternalIds.length; i += CHUNK_SIZE) {
        const chunk = processedExternalIds.slice(i, i + CHUNK_SIZE);
        const [result] = await db.query(`
          UPDATE advisories
          SET status = 'expired', last_updated = CURRENT_TIMESTAMP
          WHERE status = 'active'
            AND external_id IS NOT NULL
            AND external_id NOT IN (?)
        `, [chunk]);
        expiredCount += result.affectedRows;
      }
      console.log(`Marked ${expiredCount} advisories as expired`);
    }
    
    // Step 6: Create historical snapshots for trend analysis
    console.log('\nCreating historical snapshots...');
    try {
      const snapshotData = [];
      for (const [officeId, advisories] of officeAdvisories.entries()) {
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
        
        snapshotData.push({ officeId, aggregated });
      }

      // Create all snapshots
      for (const { officeId, aggregated } of snapshotData) {
        await AdvisoryHistory.createSnapshot(officeId, aggregated);
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
      SELECT s.office_code, s.name, s.state, COUNT(*) as advisory_count
      FROM advisories a
      JOIN offices s ON a.office_id = s.id
      WHERE a.status = 'active'
      GROUP BY s.id
      HAVING advisory_count > 15
      ORDER BY advisory_count DESC
      LIMIT 5
    `);
    
    if (highCountSites.length > 0) {
      console.warn('⚠️  WARNING: Sites with unusually high advisory counts detected:');
      const anomalyDetails = [];
      highCountSites.forEach(office => {
        console.warn(`   ${office.office_code} (${office.name}, ${office.state}): ${office.advisory_count} active advisories`);
        anomalyDetails.push({
          site_code: office.office_code,
          name: office.name,
          state: office.state,
          advisory_count: office.advisory_count
        });
      });
      console.warn('   This may indicate duplicate accumulation. Consider running cleanup.');
      
      // Send alert for anomaly
      await alertAnomaly(
        `${highCountSites.length} office(s) have unusually high advisory counts (>15)`,
        { offices: anomalyDetails }
      );
    } else {
      console.log('✓ No anomalies detected');
    }
    
    // Step 9: Ingest weather observations from nearest stations
    const observationResult = await ingestObservations(offices);
    
    // Invalidate dynamic cache keys (advisories, status).
    // Static keys (sites, states, regions) are preserved to avoid thundering herd.
    cache.invalidateDynamic();

    // Pre-warm the most expensive key so the first user post-ingestion gets a
    // cache hit rather than hitting the database cold.
    try {
      const fresh = await AdvisoryModel.getActive();
      cache.set(
        cache.CACHE_KEYS.ACTIVE_ADVISORIES,
        { success: true, data: fresh, count: fresh.length },
        cache.TTL.SHORT
      );
      console.log(`[CACHE] Pre-warmed ACTIVE_ADVISORIES with ${fresh.length} advisories`);
    } catch (warmErr) {
      console.warn('[CACHE] Pre-warm failed (non-fatal):', warmErr.message);
    }
    
    // Save timestamp of successful ingestion
    const timestamp = new Date().toISOString();
    fs.writeFileSync(LAST_INGESTION_FILE, JSON.stringify({ lastUpdated: timestamp }));
    
    const totalFailed = advisoriesFailed + statusesFailed;
    const logSummary = totalFailed > 0 ? console.warn : console.log;

    logSummary('\n═══ Ingestion Complete ═══');
    console.log(`Advisories created/updated: ${advisoriesCreated}`);
    console.log(`Site statuses updated: ${statusesUpdated}`);
    console.log(`Advisories marked expired: ${expiredCount}`);
    console.log(`Old expired removed: ${expiredRemoved}`);
    console.log(`Observations updated: ${observationResult.updated}/${observationResult.total} sites (${observationResult.uniqueStations} unique stations)`);
    if (totalFailed > 0) {
      console.warn(`⚠️  Partial failures: ${advisoriesFailed} advisory write(s) failed, ${statusesFailed} status update(s) failed`);
      console.warn(`⚠️  Ingestion completed with errors — review logs above for details`);
    }
    console.log(`═══════════════════════════\n`);

    return {
      status: totalFailed > 0 ? 'partial' : 'success',
      advisoriesCreated,
      advisoriesFailed,
      statusesUpdated,
      statusesFailed,
      expiredCount,
      expiredRemoved,
      observationsUpdated: observationResult.updated,
      observationsTotal: observationResult.total
    };
    
  } catch (error) {
    console.error('\n✗ NOAA ingestion failed:', error.message);
    throw error;
  } finally {
    isIngesting = false;
    ingestionStartedAt = null;
  }
}

/**
 * Ingest latest weather observations for all offices with mapped observation stations.
 * Deduplicates station fetches (multiple offices may share a station).
 * @param {Array} offices - All office objects from database
 * @returns {Object} { total, updated, failed, uniqueStations }
 */
async function ingestObservations(offices) {
  console.log('\n═══ Weather Observations Ingestion ═══');

  // Filter to offices with observation_station mapped
  const mappedSites = offices.filter(s => s.observation_station);

  if (mappedSites.length === 0) {
    console.log('No offices have observation stations mapped. Run fetch-observation-stations.js first.');
    return { total: 0, updated: 0, failed: 0, uniqueStations: 0 };
  }

  // Build station -> offices mapping to deduplicate fetches
  const stationToSites = new Map();
  for (const office of mappedSites) {
    const station = office.observation_station;
    if (!stationToSites.has(station)) {
      stationToSites.set(station, []);
    }
    stationToSites.get(station).push(office);
  }
  
  const uniqueStations = stationToSites.size;
  console.log(`${mappedSites.length} offices mapped to ${uniqueStations} unique stations`);
  
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
      
      // Upsert for each office mapped to this station
      for (const office of stationSites) {
        try {
          await ObservationModel.upsert(office.id, data);
          updated++;
        } catch (dbError) {
          console.error(`  Error saving observation for office ${office.office_code}: ${dbError.message}`);
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
