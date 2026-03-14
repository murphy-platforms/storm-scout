#!/usr/bin/env node
/**
 * Generate OSM Location CSVs for Storm Scout
 *
 * Queries OpenStreetMap Overpass API for US locations, enriches with
 * Nominatim reverse geocoding, and outputs CSV files compatible with
 * import-offices.js.
 *
 * Usage:
 *   node src/scripts/generate-osm-locations.js              # all datasets
 *   node src/scripts/generate-osm-locations.js airports      # single dataset
 *
 * Output: backend/src/data/csv/{airports,train-stations,ranger-stations,drive-in-theaters}.csv
 */

'use strict';

const fs = require('fs');
const path = require('path');
const axios = require('axios');

// ─── Configuration ──────────────────────────────────────────────────────────

const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';
const NOMINATIM_DELAY_MS = 1500; // 1 req/sec + generous safety margin
const NOMINATIM_MAX_RETRIES = 3; // retries on 429 rate limit
const OVERPASS_DELAY_MS = 5000; // between Overpass queries
const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'csv');
const CACHE_PATH = path.join(OUTPUT_DIR, '.geocode-cache.json');
const USER_AGENT = 'StormScout/1.0 (osm-location-generator)';

const BOUNDING_BOXES = [
    { name: 'CONUS', bbox: '24.5,-125.0,49.5,-66.0' },
    { name: 'Alaska', bbox: '51.0,-180.0,72.0,-129.0' },
    { name: 'Hawaii', bbox: '18.5,-161.0,22.5,-154.0' }
];

// ─── State → Region mapping (from add-new-offices.js) ──────────────────────

const STATE_REGIONS = {
    TX: 'South Central',
    FL: 'Southeast',
    NM: 'Southwest',
    MT: 'Mountain',
    NH: 'Northeast',
    GA: 'Southeast',
    NY: 'Mid-Atlantic',
    LA: 'South Central',
    AL: 'Southeast',
    AR: 'South Central',
    AZ: 'Southwest',
    CA: 'West',
    CO: 'Mountain',
    CT: 'Northeast',
    DE: 'Mid-Atlantic',
    HI: 'Pacific',
    ID: 'Mountain',
    IL: 'Midwest',
    IN: 'Midwest',
    IA: 'Midwest',
    KS: 'Midwest',
    KY: 'Southeast',
    ME: 'Northeast',
    MD: 'Mid-Atlantic',
    MA: 'Northeast',
    MI: 'Midwest',
    MN: 'Midwest',
    MS: 'Southeast',
    MO: 'Midwest',
    NE: 'Midwest',
    NV: 'West',
    NJ: 'Mid-Atlantic',
    NC: 'Southeast',
    ND: 'Midwest',
    OH: 'Midwest',
    OK: 'South Central',
    OR: 'West',
    PA: 'Mid-Atlantic',
    RI: 'Northeast',
    SC: 'Southeast',
    SD: 'Midwest',
    TN: 'Southeast',
    UT: 'Mountain',
    VT: 'Northeast',
    VA: 'Mid-Atlantic',
    WA: 'West',
    WV: 'Mid-Atlantic',
    WI: 'Midwest',
    WY: 'Mountain',
    AK: 'Alaska',
    GU: 'Pacific',
    PR: 'Caribbean',
    VI: 'Caribbean'
};

// ─── Dataset definitions ────────────────────────────────────────────────────

const DATASETS = [
    {
        id: 'airports',
        filename: 'airports.csv',
        overpassFilter: '["aeroway"="aerodrome"]["iata"]',
        limit: 300,
        defaultName: (tags) => `${tags.iata || 'Unknown'} Airport`
    },
    {
        id: 'train-stations',
        filename: 'train-stations.csv',
        overpassFilter: '["railway"="station"]',
        limit: 300,
        defaultName: () => 'Train Station'
    },
    {
        id: 'ranger-stations',
        filename: 'ranger-stations.csv',
        overpassFilter: '["amenity"="ranger_station"]',
        limit: 300,
        defaultName: () => 'Ranger Station'
    },
    {
        id: 'drive-in-theaters',
        filename: 'drive-in-theaters.csv',
        overpassFilter: '["amenity"="cinema"]["drive_in"="yes"]',
        limit: 300,
        defaultName: () => 'Drive-In Theater'
    }
];

// ─── Utilities ──────────────────────────────────────────────────────────────

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadGeocodeCache() {
    try {
        if (fs.existsSync(CACHE_PATH)) {
            return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
        }
    } catch (err) {
        console.warn('  Warning: corrupt geocode cache, starting fresh');
    }
    return {};
}

function saveGeocodeCache(cache) {
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache));
}

// ─── Overpass API ───────────────────────────────────────────────────────────

async function fetchFromOverpass(dataset) {
    const allElements = [];

    for (const bb of BOUNDING_BOXES) {
        const query = `[out:json][timeout:300];(
  node${dataset.overpassFilter}(${bb.bbox});
  way${dataset.overpassFilter}(${bb.bbox});
);out center body;`;

        console.log(`  Querying Overpass for ${dataset.id} in ${bb.name}...`);

        let response;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                response = await axios.post(OVERPASS_ENDPOINT, `data=${encodeURIComponent(query)}`, {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    timeout: 320000
                });
                break;
            } catch (err) {
                const wait = attempt * 30000;
                console.warn(`  Overpass error (attempt ${attempt}/3): ${err.message}. Retrying in ${wait / 1000}s...`);
                if (attempt === 3) throw err;
                await sleep(wait);
            }
        }

        const count = response.data.elements ? response.data.elements.length : 0;
        console.log(`  Found ${count} elements in ${bb.name}`);
        allElements.push(...(response.data.elements || []));

        await sleep(OVERPASS_DELAY_MS);
    }

    return allElements;
}

// ─── Deduplication ──────────────────────────────────────────────────────────

function deduplicateElements(elements) {
    const seen = new Set();
    return elements.filter((el) => {
        const key = `${el.type}/${el.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// ─── Location extraction ────────────────────────────────────────────────────

function extractLocations(elements, dataset) {
    return elements
        .map((el) => {
            const tags = el.tags || {};
            const lat = el.lat || (el.center && el.center.lat);
            const lon = el.lon || (el.center && el.center.lon);

            if (!lat || !lon) return null;

            return {
                name: tags.name || dataset.defaultName(tags),
                latitude: lat,
                longitude: lon,
                zip: tags['addr:postcode'] || null,
                city: tags['addr:city'] || null,
                state: tags['addr:state'] || null,
                county: null,
                countryCode: null,
                tags
            };
        })
        .filter(Boolean);
}

// ─── Nominatim enrichment ───────────────────────────────────────────────────

async function nominatimRequest(lat, lon) {
    for (let attempt = 1; attempt <= NOMINATIM_MAX_RETRIES; attempt++) {
        try {
            const response = await axios.get(NOMINATIM_ENDPOINT, {
                params: {
                    lat,
                    lon,
                    format: 'json',
                    zoom: 18,
                    addressdetails: 1
                },
                headers: { 'User-Agent': USER_AGENT },
                timeout: 10000
            });
            return response.data;
        } catch (err) {
            const is429 = err.response && err.response.status === 429;
            if (is429 && attempt < NOMINATIM_MAX_RETRIES) {
                const backoff = attempt * 30000; // 30s, 60s, 90s
                console.warn(
                    `  Rate limited (429), backing off ${backoff / 1000}s (attempt ${attempt}/${NOMINATIM_MAX_RETRIES})...`
                );
                await sleep(backoff);
                continue;
            }
            throw err;
        }
    }
}

function countValidLocations(locations) {
    return locations.filter((l) => {
        if (!l.zip || !l.city || !l.state) return false;
        const zip = l.zip.trim().substring(0, 5);
        if (!/^\d{5}$/.test(zip)) return false;
        const st = (l.state || '').trim().toUpperCase();
        if (!/^[A-Z]{2}$/.test(st)) return false;
        if (l.countryCode && l.countryCode !== 'us') return false;
        return true;
    }).length;
}

async function enrichWithNominatim(locations, limit) {
    const cache = loadGeocodeCache();
    let apiCalls = 0;
    let cacheHits = 0;
    let errors = 0;
    let consecutive429s = 0;

    // Phase 1: Apply ALL cache hits first (free, no API calls)
    for (const loc of locations) {
        if (loc.zip && loc.city && loc.state) continue;
        const cacheKey = `${loc.latitude.toFixed(6)},${loc.longitude.toFixed(6)}`;
        if (cache[cacheKey]) {
            applyGeocodeResult(loc, cache[cacheKey]);
            cacheHits++;
        }
    }

    // Check if cache was sufficient
    const validAfterCache = countValidLocations(locations);
    console.log(`  Cache phase: ${cacheHits} cache hits, ${validAfterCache} valid locations after cache`);

    if (validAfterCache >= limit * 2) {
        console.log(
            `  Cache sufficient — skipping Nominatim API calls (${validAfterCache} valid >= ${limit * 2} needed)`
        );
        return locations;
    }

    // Phase 2: API calls for remaining uncached locations
    const uncached = locations.filter((l) => {
        if (l.zip && l.city && l.state) return false;
        const ck = `${l.latitude.toFixed(6)},${l.longitude.toFixed(6)}`;
        return !cache[ck];
    });

    console.log(`  API phase: ${uncached.length} locations need Nominatim calls...`);

    for (let i = 0; i < uncached.length; i++) {
        const loc = uncached[i];
        const cacheKey = `${loc.latitude.toFixed(6)},${loc.longitude.toFixed(6)}`;

        // Bail out after 3 consecutive 429s — Nominatim is blocking us
        if (consecutive429s >= 3) {
            console.warn(`  Stopping Nominatim: ${consecutive429s} consecutive rate limit errors. Try again later.`);
            break;
        }

        // Early stop check every 50 API calls
        if (apiCalls > 0 && apiCalls % 50 === 0) {
            saveGeocodeCache(cache);
            const validNow = countValidLocations(locations);
            console.log(`  Progress: ${apiCalls} API calls, ${validNow} valid locations`);
            if (validNow >= limit * 2) {
                console.log(`  Early stop: ${validNow} valid locations exceeds 2x limit of ${limit}`);
                break;
            }
        }

        await sleep(NOMINATIM_DELAY_MS);

        try {
            const data = await nominatimRequest(loc.latitude, loc.longitude);

            const addr = data.address || {};
            const iso = addr['ISO3166-2-lvl4'] || '';
            const result = {
                postcode: addr.postcode || null,
                city: addr.city || addr.town || addr.village || addr.hamlet || addr.municipality || null,
                state: iso.startsWith('US-') ? iso.split('-')[1] : null,
                county: addr.county || null,
                countryCode: addr.country_code || null
            };

            cache[cacheKey] = result;
            applyGeocodeResult(loc, result);
            apiCalls++;
            consecutive429s = 0; // reset on success
        } catch (err) {
            errors++;
            const is429 = err.response && err.response.status === 429;
            if (is429) consecutive429s++;
            if (errors <= 5) {
                console.warn(`  Nominatim error for ${cacheKey}: ${err.message}`);
            } else if (errors === 6) {
                console.warn(`  Suppressing further Nominatim error messages...`);
            }
        }
    }

    saveGeocodeCache(cache);
    console.log(`  Nominatim complete: ${apiCalls} API calls, ${cacheHits} cache hits, ${errors} errors`);
    return locations;
}

function applyGeocodeResult(loc, result) {
    if (!loc.zip && result.postcode) loc.zip = result.postcode;
    if (!loc.city && result.city) loc.city = result.city;
    if (!loc.state && result.state) loc.state = result.state;
    if (!loc.county && result.county) loc.county = result.county;
    if (result.countryCode) loc.countryCode = result.countryCode;
}

// ─── Validation ─────────────────────────────────────────────────────────────

function validateLocations(locations) {
    let filtered = 0;
    const valid = locations.filter((loc) => {
        // US only
        if (loc.countryCode && loc.countryCode !== 'us') {
            filtered++;
            return false;
        }

        // Truncate zip+4 to 5 digits
        if (loc.zip) loc.zip = loc.zip.trim().substring(0, 5);

        // Required fields
        if (!loc.zip || !loc.name || !loc.city || !loc.state) {
            filtered++;
            return false;
        }

        // Zip: exactly 5 digits
        if (!/^\d{5}$/.test(loc.zip)) {
            filtered++;
            return false;
        }

        // State: exactly 2 uppercase letters
        loc.state = loc.state.trim().toUpperCase();
        if (!/^[A-Z]{2}$/.test(loc.state)) {
            filtered++;
            return false;
        }

        // Valid coordinates
        if (isNaN(loc.latitude) || isNaN(loc.longitude)) {
            filtered++;
            return false;
        }

        return true;
    });

    console.log(`  Validation: ${valid.length} valid, ${filtered} filtered out`);
    return valid;
}

// ─── Geographic diversity selection ─────────────────────────────────────────

function selectLocations(locations, limit) {
    if (locations.length <= limit) return locations;

    // Group by state
    const byState = {};
    for (const loc of locations) {
        if (!byState[loc.state]) byState[loc.state] = [];
        byState[loc.state].push(loc);
    }

    // Round-robin by state for geographic spread
    const selected = [];
    const states = Object.keys(byState).sort();
    let round = 0;

    while (selected.length < limit) {
        let addedThisRound = false;
        for (const state of states) {
            if (selected.length >= limit) break;
            if (round < byState[state].length) {
                selected.push(byState[state][round]);
                addedThisRound = true;
            }
        }
        if (!addedThisRound) break;
        round++;
    }

    return selected;
}

// ─── CSV writer ─────────────────────────────────────────────────────────────

function escapeCsvField(val) {
    const str = String(val || '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

function writeCsv(locations, filename) {
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    const outputPath = path.join(OUTPUT_DIR, filename);
    const columns = ['zip', 'name', 'city', 'state', 'latitude', 'longitude', 'region', 'county', 'ugc_codes', 'cwa'];
    const header = columns.join(',');

    const rows = locations.map((loc) => {
        return columns.map((col) => escapeCsvField(loc[col])).join(',');
    });

    fs.writeFileSync(outputPath, [header, ...rows].join('\n') + '\n');
    console.log(`  Wrote ${locations.length} rows to ${outputPath}`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function processDataset(dataset) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Processing: ${dataset.id}`);
    console.log('='.repeat(60));

    // Step 1: Fetch from Overpass
    const rawElements = await fetchFromOverpass(dataset);

    // Step 2: Deduplicate
    const unique = deduplicateElements(rawElements);
    console.log(`  Deduplicated: ${unique.length} unique elements`);

    // Step 3: Extract locations
    const locations = extractLocations(unique, dataset);
    console.log(`  Extracted: ${locations.length} locations with coordinates`);

    // Step 4: Enrich with Nominatim
    await enrichWithNominatim(locations, dataset.limit);

    // Step 5: Validate
    const valid = validateLocations(locations);

    // Step 6: Select with geographic diversity
    const selected = selectLocations(valid, dataset.limit);
    console.log(`  Selected: ${selected.length} locations (limit: ${dataset.limit})`);

    // Step 7: Populate optional fields
    for (const loc of selected) {
        loc.region = STATE_REGIONS[loc.state] || '';
        loc.county = loc.county || '';
        loc.ugc_codes = '';
        loc.cwa = '';
    }

    // Step 8: Write CSV
    writeCsv(selected, dataset.filename);

    return { id: dataset.id, candidates: unique.length, selected: selected.length };
}

async function main() {
    const targetId = process.argv[2];
    const datasetsToRun = targetId ? DATASETS.filter((d) => d.id === targetId) : DATASETS;

    if (targetId && datasetsToRun.length === 0) {
        console.error(`Unknown dataset: ${targetId}`);
        console.error(`Available: ${DATASETS.map((d) => d.id).join(', ')}`);
        process.exit(1);
    }

    console.log(`Storm Scout OSM Location Generator`);
    console.log(`Datasets: ${datasetsToRun.map((d) => d.id).join(', ')}`);

    const startTime = Date.now();
    const results = [];

    for (const dataset of datasetsToRun) {
        const result = await processDataset(dataset);
        results.push(result);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);

    console.log(`\n${'='.repeat(60)}`);
    console.log('Generation Summary');
    console.log('='.repeat(60));
    for (const r of results) {
        console.log(`  ${r.id.padEnd(20)} : ${r.selected} rows (from ${r.candidates} candidates)`);
    }
    console.log(`  Elapsed: ${elapsed}s`);
    console.log(`\nCSV files written to: ${OUTPUT_DIR}`);
}

main().catch((err) => {
    console.error('Fatal error:', err.message);
    process.exit(1);
});
