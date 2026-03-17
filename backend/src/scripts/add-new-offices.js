#!/usr/bin/env node
/**
 * Add New Offices to Storm Scout
 *
 * Enriches new office data with coordinates (via Census Geocoder / Nominatim)
 * and NOAA weather data (UGC codes, CWA, county), then outputs:
 *   1. JSON entries for offices.json
 *   2. SQL INSERT statements for production
 *   3. A verification report
 *
 * Usage: node src/scripts/add-new-offices.js
 *
 * @generated AI-authored (Claude, Warp) — vanilla JS by design
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// ─── Configuration ───────────────────────────────────────────────────────────
const DELAY_MS = 600; // Delay between API calls to respect rate limits
const USER_AGENT = process.env.NOAA_API_USER_AGENT || 'StormScout/1.0 (configure-NOAA_API_USER_AGENT-in-.env)';
const OFFICES_JSON_PATH = path.join(__dirname, '../data/offices.json');
const OUTPUT_DIR = path.join(__dirname, '../data');

// ─── State name → 2-letter code mapping ──────────────────────────────────────
const STATE_CODES = {
    ALABAMA: 'AL',
    ALASKA: 'AK',
    ARIZONA: 'AZ',
    ARKANSAS: 'AR',
    CALIFORNIA: 'CA',
    COLORADO: 'CO',
    CONNECTICUT: 'CT',
    DELAWARE: 'DE',
    FLORIDA: 'FL',
    GEORGIA: 'GA',
    HAWAII: 'HI',
    IDAHO: 'ID',
    ILLINOIS: 'IL',
    INDIANA: 'IN',
    IOWA: 'IA',
    KANSAS: 'KS',
    KENTUCKY: 'KY',
    LOUISIANA: 'LA',
    MAINE: 'ME',
    MARYLAND: 'MD',
    MASSACHUSETTS: 'MA',
    MICHIGAN: 'MI',
    MINNESOTA: 'MN',
    MISSISSIPPI: 'MS',
    MISSOURI: 'MO',
    MONTANA: 'MT',
    NEBRASKA: 'NE',
    NEVADA: 'NV',
    'NEW HAMPSHIRE': 'NH',
    'NEW JERSEY': 'NJ',
    'NEW MEXICO': 'NM',
    'NEW YORK': 'NY',
    'NORTH CAROLINA': 'NC',
    'NORTH DAKOTA': 'ND',
    OHIO: 'OH',
    OKLAHOMA: 'OK',
    OREGON: 'OR',
    PENNSYLVANIA: 'PA',
    'RHODE ISLAND': 'RI',
    'SOUTH CAROLINA': 'SC',
    'SOUTH DAKOTA': 'SD',
    TENNESSEE: 'TN',
    TEXAS: 'TX',
    UTAH: 'UT',
    VERMONT: 'VT',
    VIRGINIA: 'VA',
    WASHINGTON: 'WA',
    'WEST VIRGINIA': 'WV',
    WISCONSIN: 'WI',
    WYOMING: 'WY'
};

// ─── State → Region mapping (based on existing offices.json assignments) ─────
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

// ─── Example offices to add ─────────────────────────────────────────────────
// Replace these with your own locations. Each entry needs at minimum:
//   - office_code (5-digit zip), name, city, state_full
//   - address (for geocoding) OR note with "NEEDS VERIFICATION"
// The script will geocode coordinates and fetch NOAA weather data automatically.
// Replace these with your own office data before running.
const NEW_OFFICES = [
    {
        office_code: '10001',
        name: 'Example Office A',
        city: 'New York',
        state_full: 'NEW YORK',
        address: '123 Main St',
        zip: '10001',
        source: 'Example entry — replace with real data'
    },
    {
        office_code: '90210',
        name: 'Example Office B',
        city: 'Beverly Hills',
        state_full: 'CALIFORNIA',
        address: '456 Elm Ave',
        zip: '90210',
        source: 'Example entry — replace with real data'
    }
];

// ─── Helper functions ────────────────────────────────────────────────────────

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Geocode an address using the US Census Geocoder (free, no API key)
 */
async function geocodeCensus(address, city, state) {
    const url = 'https://geocoding.geo.census.gov/geocoder/locations/address';
    try {
        const response = await axios.get(url, {
            params: {
                street: address,
                city: city,
                state: state,
                benchmark: 'Public_AR_Current',
                format: 'json'
            },
            timeout: 15000
        });

        const matches = response.data?.result?.addressMatches;
        if (matches && matches.length > 0) {
            const match = matches[0];
            return {
                latitude: parseFloat(match.coordinates.y),
                longitude: parseFloat(match.coordinates.x),
                matched_address: match.matchedAddress,
                source: 'census_geocoder'
            };
        }
        return null;
    } catch (error) {
        console.error(`  Census geocode error: ${error.message}`);
        return null;
    }
}

/**
 * Geocode using Nominatim (OpenStreetMap) - fallback
 */
async function geocodeNominatim(query) {
    try {
        const response = await axios.get('https://nominatim.openstreetmap.org/search', {
            params: { q: query, format: 'json', limit: 1, countrycodes: 'us' },
            headers: { 'User-Agent': USER_AGENT },
            timeout: 15000
        });

        if (response.data && response.data.length > 0) {
            const result = response.data[0];
            return {
                latitude: parseFloat(result.lat),
                longitude: parseFloat(result.lon),
                matched_address: result.display_name,
                source: 'nominatim'
            };
        }
        return null;
    } catch (error) {
        console.error(`  Nominatim geocode error: ${error.message}`);
        return null;
    }
}

/**
 * Extract UGC code from NOAA zone URL
 */
function extractUGCFromUrl(url) {
    if (!url) return null;
    const match = url.match(/\/([A-Z]{2}[CZ]\d{3})$/);
    return match ? match[1] : null;
}

/**
 * Fetch NOAA weather data for a lat/lon pair
 */
async function fetchNOAAData(lat, lon) {
    const url = `https://api.weather.gov/points/${lat},${lon}`;
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': USER_AGENT,
                Accept: 'application/geo+json'
            },
            timeout: 15000
        });

        const props = response.data.properties;
        const forecastZone = extractUGCFromUrl(props.forecastZone);
        const countyZone = extractUGCFromUrl(props.county);

        // Fetch county name
        let countyName = null;
        if (props.county) {
            try {
                await sleep(DELAY_MS);
                const countyResponse = await axios.get(props.county, {
                    headers: { 'User-Agent': USER_AGENT },
                    timeout: 10000
                });
                countyName = countyResponse.data.properties?.name;
            } catch (e) {
                // Ignore county name fetch errors
            }
        }

        return {
            ugc_codes: [forecastZone, countyZone].filter(Boolean),
            cwa: props.cwa,
            county: countyName,
            success: true
        };
    } catch (error) {
        console.error(`  NOAA error: ${error.message}`);
        return { ugc_codes: [], cwa: null, county: null, success: false, error: error.message };
    }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
    console.log('═══════════════════════════════════════════════════');
    console.log('  Storm Scout - Add New Offices');
    console.log('═══════════════════════════════════════════════════\n');
    console.log(`Processing ${NEW_OFFICES.length} new offices...\n`);

    const results = [];
    const warnings = [];

    for (let i = 0; i < NEW_OFFICES.length; i++) {
        const office = NEW_OFFICES[i];
        const stateCode = STATE_CODES[office.state_full];
        const region = STATE_REGIONS[stateCode];
        const progress = `[${i + 1}/${NEW_OFFICES.length}]`;

        console.log(`${progress} ${office.office_code} - ${office.name} (${office.city}, ${stateCode})`);

        // Step 1: Geocode
        let geo = null;

        if (office.address) {
            // Try Census Geocoder first for confirmed addresses
            console.log(`  Geocoding: ${office.address}, ${office.city}, ${stateCode}`);
            geo = await geocodeCensus(office.address, office.city, stateCode);
            await sleep(DELAY_MS);
        }

        if (!geo) {
            // Fallback: geocode the city center
            const query = `${office.city}, ${stateCode}`;
            console.log(`  Fallback: geocoding city center: ${query}`);
            geo = await geocodeNominatim(query);
            await sleep(DELAY_MS);

            if (geo) {
                geo.source = 'nominatim_city_fallback';
                warnings.push(
                    `${office.office_code} (${office.city}, ${stateCode}): Used city-center coordinates - needs manual verification`
                );
            }
        }

        if (!geo) {
            console.log(`  ✗ FAILED to geocode - skipping NOAA lookup`);
            warnings.push(`${office.office_code}: GEOCODING FAILED completely`);
            results.push({
                ...office,
                stateCode,
                region,
                latitude: null,
                longitude: null,
                ugc_codes: [],
                cwa: null,
                county: null,
                geo_source: 'FAILED'
            });
            continue;
        }

        console.log(`  ✓ Coordinates: ${geo.latitude.toFixed(5)}, ${geo.longitude.toFixed(5)} (${geo.source})`);

        // Step 2: Fetch NOAA data
        console.log(`  Fetching NOAA data...`);
        await sleep(DELAY_MS);
        const noaa = await fetchNOAAData(geo.latitude, geo.longitude);

        if (noaa.success) {
            console.log(`  ✓ UGC: ${noaa.ugc_codes.join(', ')} | CWA: ${noaa.cwa} | County: ${noaa.county}`);
        } else {
            console.log(`  ✗ NOAA lookup failed: ${noaa.error}`);
            warnings.push(`${office.office_code}: NOAA lookup failed - ${noaa.error}`);
        }

        results.push({
            office_code: office.office_code,
            name: office.name,
            city: office.city,
            stateCode,
            region,
            latitude: geo.latitude,
            longitude: geo.longitude,
            address: office.address,
            zip: office.zip,
            ugc_codes: noaa.ugc_codes,
            cwa: noaa.cwa,
            county: noaa.county,
            geo_source: geo.source,
            matched_address: geo.matched_address,
            note: office.note || null,
            source: office.source
        });

        console.log('');
    }

    // ─── Generate outputs ──────────────────────────────────────────────────────

    // 1. JSON entries for offices.json
    const jsonEntries = results
        .filter((r) => r.latitude != null)
        .map((r) => {
            const entry = {
                office_code: r.office_code,
                name: r.name,
                city: r.city,
                state: r.stateCode,
                latitude: parseFloat(r.latitude.toFixed(5)),
                longitude: parseFloat(r.longitude.toFixed(5)),
                region: r.region,
                cwa: r.cwa || null
            };
            // Only include county/ugc_codes if we have them
            if (r.county) entry.county = r.county;
            if (r.ugc_codes && r.ugc_codes.length > 0) entry.ugc_codes = r.ugc_codes;
            return entry;
        });

    const jsonOutputPath = path.join(OUTPUT_DIR, 'new-offices-output.json');
    fs.writeFileSync(jsonOutputPath, JSON.stringify(jsonEntries, null, 2));
    console.log(`\n✓ JSON entries saved to: ${jsonOutputPath}`);

    // 2. SQL INSERT statements
    const sqlLines = ['-- Storm Scout: INSERT new offices', `-- Generated: ${new Date().toISOString()}`, ''];

    for (const r of results) {
        if (r.latitude == null) {
            sqlLines.push(`-- SKIPPED ${r.office_code} (${r.city}) - geocoding failed`);
            continue;
        }

        const ugcJson = r.ugc_codes.length > 0 ? `'${JSON.stringify(r.ugc_codes)}'` : 'NULL';
        const county = r.county ? `'${r.county.replace(/'/g, "''")}'` : 'NULL';
        const cwa = r.cwa ? `'${r.cwa}'` : 'NULL';
        const name = r.name.replace(/'/g, "''");
        const city = r.city.replace(/'/g, "''");

        sqlLines.push(
            `INSERT IGNORE INTO offices (office_code, name, city, state, county, ugc_codes, cwa, latitude, longitude, region)`,
            `VALUES ('${r.office_code}', '${name}', '${city}', '${r.stateCode}', ${county}, ${ugcJson}, ${cwa}, ${r.latitude.toFixed(7)}, ${r.longitude.toFixed(7)}, '${r.region}');`,
            ''
        );
    }

    const sqlOutputPath = path.join(OUTPUT_DIR, 'new-offices-insert.sql');
    fs.writeFileSync(sqlOutputPath, sqlLines.join('\n'));
    console.log(`✓ SQL INSERT statements saved to: ${sqlOutputPath}`);

    // 3. Verification report
    console.log('\n═══════════════════════════════════════════════════');
    console.log('  VERIFICATION REPORT');
    console.log('═══════════════════════════════════════════════════\n');

    console.log(`Total offices processed: ${results.length}`);
    console.log(`Successfully geocoded: ${results.filter((r) => r.latitude != null).length}`);
    console.log(`NOAA data retrieved:   ${results.filter((r) => r.ugc_codes.length > 0).length}`);
    console.log(`Warnings:              ${warnings.length}\n`);

    if (warnings.length > 0) {
        console.log('⚠️  WARNINGS:');
        warnings.forEach((w) => console.log(`  - ${w}`));
        console.log('');
    }

    console.log('─── Office Details ─────────────────────────────────\n');

    for (const r of results) {
        console.log(`  ${r.office_code} | ${r.name}`);
        console.log(`    City: ${r.city}, ${r.stateCode} | Region: ${r.region}`);
        if (r.address) console.log(`    Address: ${r.address}`);
        if (r.latitude != null) {
            console.log(`    Coords: ${r.latitude.toFixed(5)}, ${r.longitude.toFixed(5)} (${r.geo_source})`);
        } else {
            console.log(`    Coords: FAILED`);
        }
        console.log(
            `    UGC: ${r.ugc_codes.length > 0 ? r.ugc_codes.join(', ') : 'none'} | CWA: ${r.cwa || 'none'} | County: ${r.county || 'none'}`
        );
        if (r.note) console.log(`    ⚠️  ${r.note}`);
        console.log('');
    }

    console.log('═══════════════════════════════════════════════════');
    console.log('  NEXT STEPS');
    console.log('═══════════════════════════════════════════════════\n');
    console.log('1. Review the verification report above');
    console.log('2. Manually verify any offices marked with ⚠️  warnings');
    console.log(`3. Review/edit: ${jsonOutputPath}`);
    console.log(`4. Review/edit: ${sqlOutputPath}`);
    console.log('5. Merge new entries into offices.json');
    console.log('6. Run SQL on production: ssh → mysql or phpMyAdmin');
    console.log('7. Verify on Storm Scout dashboard\n');
}

main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
