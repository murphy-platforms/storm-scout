#!/usr/bin/env node

/**
 * Fetch Observation Stations
 * One-time script to map each site to its nearest NWS observation station.
 * Calls /points/{lat},{lon} -> follows observationStations URL -> takes nearest station.
 * Stores the station ICAO code in sites.observation_station.
 *
 * Usage:
 *   node src/scripts/fetch-observation-stations.js              # Apply changes
 *   node src/scripts/fetch-observation-stations.js --dry-run    # Preview only
 */

require('dotenv').config();
const { getDatabase, initDatabase } = require('../config/database');
const { getObservationStations } = require('../ingestion/utils/api-client');

const isDryRun = process.argv.includes('--dry-run');

async function fetchObservationStations() {
  console.log('═══ Fetch Observation Stations ═══');
  console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes)' : 'LIVE (will update database)'}`);
  console.log(`Time: ${new Date().toISOString()}\n`);

  await initDatabase();
  const db = getDatabase();

  // Get all sites
  const [sites] = await db.query('SELECT id, site_code, name, city, state, latitude, longitude, observation_station FROM sites ORDER BY state, city');
  console.log(`Found ${sites.length} sites\n`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const failures = [];

  for (let i = 0; i < sites.length; i++) {
    const site = sites[i];
    const progress = `[${i + 1}/${sites.length}]`;

    // Skip if already has a station mapped (use --force to override)
    if (site.observation_station && !process.argv.includes('--force')) {
      console.log(`${progress} ${site.site_code} (${site.city}, ${site.state}) - Already mapped to ${site.observation_station}, skipping`);
      skipped++;
      continue;
    }

    try {
      const stations = await getObservationStations(
        parseFloat(site.latitude),
        parseFloat(site.longitude)
      );

      if (stations.length === 0) {
        console.warn(`${progress} ${site.site_code} (${site.city}, ${site.state}) - No stations found`);
        failures.push({ site_code: site.site_code, reason: 'No stations returned' });
        failed++;
        continue;
      }

      const nearest = stations[0];
      const stationId = nearest.stationIdentifier;
      const stationName = nearest.name;

      console.log(`${progress} ${site.site_code} (${site.city}, ${site.state}) -> ${stationId} (${stationName})`);

      if (!isDryRun) {
        await db.query(
          'UPDATE sites SET observation_station = ? WHERE id = ?',
          [stationId, site.id]
        );
      }

      updated++;
    } catch (error) {
      console.error(`${progress} ${site.site_code} (${site.city}, ${site.state}) - ERROR: ${error.message}`);
      failures.push({ site_code: site.site_code, reason: error.message });
      failed++;
    }
  }

  console.log('\n═══ Summary ═══');
  console.log(`Updated: ${updated}`);
  console.log(`Skipped (already mapped): ${skipped}`);
  console.log(`Failed: ${failed}`);

  if (failures.length > 0) {
    console.log('\nFailed sites:');
    failures.forEach(f => console.log(`  ${f.site_code}: ${f.reason}`));
  }

  if (isDryRun) {
    console.log('\nDRY RUN - No changes were made. Run without --dry-run to apply.');
  }

  console.log('═══════════════════════════\n');
  process.exit(0);
}

fetchObservationStations().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
