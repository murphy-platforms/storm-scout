#!/usr/bin/env node

/**
 * Fetch Observation Stations
 * One-time script to map each office to its nearest NWS observation station.
 * Calls /points/{lat},{lon} -> follows observationStations URL -> takes nearest station.
 * Stores the station ICAO code in offices.observation_station.
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

  // Get all offices
  const [offices] = await db.query('SELECT id, site_code, name, city, state, latitude, longitude, observation_station FROM offices ORDER BY state, city');
  console.log(`Found ${offices.length} offices\n`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const failures = [];

  for (let i = 0; i < offices.length; i++) {
    const office = offices[i];
    const progress = `[${i + 1}/${offices.length}]`;

    // Skip if already has a station mapped (use --force to override)
    if (office.observation_station && !process.argv.includes('--force')) {
      console.log(`${progress} ${office.site_code} (${office.city}, ${office.state}) - Already mapped to ${office.observation_station}, skipping`);
      skipped++;
      continue;
    }

    try {
      const stations = await getObservationStations(
        parseFloat(office.latitude),
        parseFloat(office.longitude)
      );

      if (stations.length === 0) {
        console.warn(`${progress} ${office.site_code} (${office.city}, ${office.state}) - No stations found`);
        failures.push({ site_code: office.site_code, reason: 'No stations returned' });
        failed++;
        continue;
      }

      const nearest = stations[0];
      const stationId = nearest.stationIdentifier;
      const stationName = nearest.name;

      console.log(`${progress} ${office.site_code} (${office.city}, ${office.state}) -> ${stationId} (${stationName})`);

      if (!isDryRun) {
        await db.query(
          'UPDATE offices SET observation_station = ? WHERE id = ?',
          [stationId, office.id]
        );
      }

      updated++;
    } catch (error) {
      console.error(`${progress} ${office.site_code} (${office.city}, ${office.state}) - ERROR: ${error.message}`);
      failures.push({ site_code: office.site_code, reason: error.message });
      failed++;
    }
  }

  console.log('\n═══ Summary ═══');
  console.log(`Updated: ${updated}`);
  console.log(`Skipped (already mapped): ${skipped}`);
  console.log(`Failed: ${failed}`);

  if (failures.length > 0) {
    console.log('\nFailed offices:');
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
