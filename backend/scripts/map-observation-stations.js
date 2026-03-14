/**
 * Map Observation Stations
 * Populates offices.observation_station with the nearest NWS ICAO station code
 * by calling the NOAA /points API for each office's lat/lon.
 *
 * Idempotent — skips offices that already have a station mapped.
 * Usage: npm run map-stations
 *
 * @generated AI-authored (Claude) — vanilla JS by design
 */

const { initDatabase, getDatabase, closeDatabase } = require('../src/config/database');
const { getObservationStations, getLatestObservation } = require('../src/ingestion/utils/api-client');

const MAX_STATION_CANDIDATES = 3;

async function mapObservationStations() {
    try {
        await initDatabase();
        const db = getDatabase();

        console.log('\n═══ Map Observation Stations ═══\n');

        // Load all offices
        const [offices] = await db.query(
            'SELECT id, office_code, latitude, longitude, observation_station FROM offices ORDER BY office_code'
        );

        const unmapped = offices.filter((o) => !o.observation_station);
        const alreadyMapped = offices.length - unmapped.length;

        console.log(`Total offices: ${offices.length}`);
        console.log(`Already mapped: ${alreadyMapped}`);
        console.log(`To map: ${unmapped.length}\n`);

        if (unmapped.length === 0) {
            console.log('All offices already have observation stations mapped. Nothing to do.');
            process.exit(0);
        }

        let mapped = 0;
        let failed = 0;

        for (let i = 0; i < unmapped.length; i++) {
            const office = unmapped[i];
            const progress = `[${i + 1}/${unmapped.length}]`;

            try {
                // Get nearest stations from NOAA
                const stations = await getObservationStations(office.latitude, office.longitude);

                if (!stations || stations.length === 0) {
                    console.log(`${progress} ${office.office_code} — no stations found for (${office.latitude}, ${office.longitude})`);
                    failed++;
                    continue;
                }

                // Try up to MAX_STATION_CANDIDATES to find one that returns a valid observation
                let selectedStation = null;
                const candidates = stations.slice(0, MAX_STATION_CANDIDATES);

                for (const station of candidates) {
                    const stationId = station.stationIdentifier;
                    if (!stationId) continue;

                    try {
                        const obs = await getLatestObservation(stationId);
                        if (obs && obs.temperature?.value != null) {
                            selectedStation = stationId;
                            break;
                        }
                    } catch {
                        // Station didn't return valid data, try next
                    }
                }

                if (!selectedStation) {
                    // Fall back to nearest station even without validated observation
                    selectedStation = candidates[0]?.stationIdentifier;
                }

                if (!selectedStation) {
                    console.log(`${progress} ${office.office_code} — no valid station identifier in response`);
                    failed++;
                    continue;
                }

                await db.query('UPDATE offices SET observation_station = ? WHERE id = ?', [selectedStation, office.id]);
                mapped++;
                console.log(`${progress} ${office.office_code} → ${selectedStation}`);
            } catch (error) {
                console.error(`${progress} ${office.office_code} — error: ${error.message}`);
                failed++;
            }
        }

        console.log('\n═══ Mapping Complete ═══\n');
        console.log(`  Mapped:         ${mapped}`);
        console.log(`  Failed:         ${failed}`);
        console.log(`  Already mapped: ${alreadyMapped}`);
        console.log(`  Total coverage: ${mapped + alreadyMapped}/${offices.length} offices\n`);

        if (mapped > 0) {
            console.log('Next step: run "npm run ingest" to fetch observations for mapped stations.\n');
        }

        await closeDatabase();
        process.exit(failed > 0 ? 1 : 0);
    } catch (error) {
        console.error('\n❌ Fatal error:', error.message);
        console.error(error);
        process.exit(1);
    }
}

mapObservationStations();
