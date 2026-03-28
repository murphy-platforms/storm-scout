/**
 * Map Observation Stations
 * Populates offices.observation_station with the nearest NWS ICAO station code
 * by calling the NOAA /points API for each office's lat/lon.
 *
 * Modes:
 *   Default     — maps stations for offices without observation_station set
 *   --backfill-names — populates station_name for offices that already have
 *                      observation_station but are missing station_name.
 *                      Deduplicates: fetches each unique station once.
 *
 * Idempotent — skips offices that already have the target field populated.
 * Usage: npm run map-stations [--backfill-names]
 *
 * @generated AI-authored (Claude) — vanilla JS by design
 */

const { initDatabase, getDatabase, closeDatabase } = require('../src/config/database');
const { getObservationStations, getLatestObservation } = require('../src/ingestion/utils/api-client');

const MAX_STATION_CANDIDATES = 3;

/**
 * Sanitize station name from NOAA API before DB insertion.
 * Strips control characters and Unicode bidi overrides, truncates to column width.
 * @param {*} name - Raw name from API response
 * @returns {string|null} Sanitized name or null
 */
function sanitizeStationName(name) {
    if (typeof name !== 'string') return null;
    const cleaned = name.replace(/[\x00-\x1F\x7F\u200E\u200F\u202A-\u202E]/g, '');
    if (cleaned.length !== name.length) {
        console.warn(`  ⚠ Station name sanitized: control characters removed from "${name}"`);
    }
    if (cleaned.length > 100) {
        console.warn(`  ⚠ Station name truncated: "${cleaned.substring(0, 50)}..." (${cleaned.length} chars → 100)`);
    }
    return cleaned.substring(0, 100) || null;
}

/**
 * Default mode: map observation stations for unmapped offices.
 * Now also captures station_name alongside the ICAO code.
 */
async function mapObservationStations() {
    try {
        await initDatabase();
        const db = getDatabase();

        console.log('\n═══ Map Observation Stations ═══\n');

        const [offices] = await db.query(
            'SELECT id, office_code, latitude, longitude, observation_station, station_name FROM offices ORDER BY office_code'
        );

        const unmapped = offices.filter((o) => !o.observation_station);
        const alreadyMapped = offices.length - unmapped.length;

        console.log(`Total offices: ${offices.length}`);
        console.log(`Already mapped: ${alreadyMapped}`);
        console.log(`To map: ${unmapped.length}\n`);

        if (unmapped.length === 0) {
            console.log('All offices already have observation stations mapped. Nothing to do.');
            console.log('Run with --backfill-names to populate missing station names.\n');
            await closeDatabase();
            process.exit(0);
        }

        let mapped = 0;
        let failed = 0;

        for (let i = 0; i < unmapped.length; i++) {
            const office = unmapped[i];
            const progress = `[${i + 1}/${unmapped.length}]`;

            try {
                const stations = await getObservationStations(office.latitude, office.longitude);

                if (!stations || stations.length === 0) {
                    console.log(
                        `${progress} ${office.office_code} — no stations found for (${office.latitude}, ${office.longitude})`
                    );
                    failed++;
                    continue;
                }

                let selectedStation = null;
                let selectedName = null;
                const candidates = stations.slice(0, MAX_STATION_CANDIDATES);

                for (const station of candidates) {
                    const stationId = station.stationIdentifier;
                    if (!stationId) continue;

                    try {
                        const obs = await getLatestObservation(stationId);
                        if (obs && obs.temperature?.value != null) {
                            selectedStation = stationId;
                            selectedName = sanitizeStationName(station.name);
                            break;
                        }
                    } catch {
                        // Station didn't return valid data, try next
                    }
                }

                if (!selectedStation) {
                    selectedStation = candidates[0]?.stationIdentifier;
                    selectedName = sanitizeStationName(candidates[0]?.name);
                }

                if (!selectedStation) {
                    console.log(`${progress} ${office.office_code} — no valid station identifier in response`);
                    failed++;
                    continue;
                }

                await db.query('UPDATE offices SET observation_station = ?, station_name = ? WHERE id = ?', [
                    selectedStation,
                    selectedName,
                    office.id
                ]);
                mapped++;
                console.log(`${progress} ${office.office_code} → ${selectedStation} (${selectedName || 'no name'})`);
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

/**
 * Backfill mode: populate station_name for offices that already have
 * observation_station but are missing station_name.
 * Deduplicates: fetches each unique station once via NOAA API.
 */
async function backfillStationNames() {
    try {
        await initDatabase();
        const db = getDatabase();

        console.log('\n═══ Backfill Station Names ═══\n');

        const [offices] = await db.query(
            'SELECT id, office_code, observation_station, station_name FROM offices WHERE observation_station IS NOT NULL AND station_name IS NULL ORDER BY office_code'
        );

        if (offices.length === 0) {
            console.log('All offices with stations already have names. Nothing to do.\n');
            await closeDatabase();
            process.exit(0);
        }

        console.log(`Offices needing station names: ${offices.length}`);

        // Deduplicate: group offices by station code
        const stationToOffices = new Map();
        for (const office of offices) {
            const code = office.observation_station;
            if (!stationToOffices.has(code)) {
                stationToOffices.set(code, []);
            }
            stationToOffices.get(code).push(office);
        }

        const uniqueStations = stationToOffices.size;
        console.log(`Unique stations to fetch: ${uniqueStations}\n`);

        let updated = 0;
        let failed = 0;
        let stationIndex = 0;

        for (const [stationCode, stationOffices] of stationToOffices.entries()) {
            stationIndex++;
            const progress = `[${stationIndex}/${uniqueStations}]`;

            try {
                // Use the first office's coordinates to look up the station
                const firstOffice = stationOffices[0];
                const [officeRows] = await db.query('SELECT latitude, longitude FROM offices WHERE id = ?', [
                    firstOffice.id
                ]);
                const { latitude, longitude } = officeRows[0];

                const stations = await getObservationStations(latitude, longitude);

                // Find the matching station in the response
                const match = stations?.find((s) => s.stationIdentifier === stationCode);
                const stationName = sanitizeStationName(match?.name);

                if (!stationName) {
                    console.log(`${progress} ${stationCode} — no name found in API response`);
                    failed += stationOffices.length;
                    continue;
                }

                // Update all offices sharing this station
                const officeIds = stationOffices.map((o) => o.id);
                const placeholders = officeIds.map(() => '?').join(',');
                await db.query(`UPDATE offices SET station_name = ? WHERE id IN (${placeholders})`, [
                    stationName,
                    ...officeIds
                ]);

                updated += stationOffices.length;
                console.log(
                    `${progress} ${stationCode} → "${stationName}" (${stationOffices.length} office${stationOffices.length > 1 ? 's' : ''})`
                );
            } catch (error) {
                console.error(`${progress} ${stationCode} — error: ${error.message}`);
                failed += stationOffices.length;
            }
        }

        console.log('\n═══ Backfill Complete ═══\n');
        console.log(`  Updated:  ${updated} offices`);
        console.log(`  Failed:   ${failed} offices`);
        console.log(`  Stations: ${uniqueStations} unique\n`);

        await closeDatabase();
        process.exit(failed > 0 ? 1 : 0);
    } catch (error) {
        console.error('\n❌ Fatal error:', error.message);
        console.error(error);
        process.exit(1);
    }
}

// Route to the correct mode
if (process.argv.includes('--backfill-names')) {
    backfillStationNames();
} else {
    mapObservationStations();
}
