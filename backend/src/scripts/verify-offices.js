#!/usr/bin/env node
/**
 * verify-offices.js
 * Geocodes imprecise addresses and verifies all 9 remaining offices against NOAA /points API.
 * Outputs a comparison report and writes verified data to verified-sites.json.
 */

const fs = require('fs');
const path = require('path');

const SITES_TO_GEOCODE = [
        ];

const OFFICES_TO_VERIFY_ONLY = [/* redacted */];

const ALL_SITE_CODES = [...SITES_TO_GEOCODE.map(s => s.site_code), ...SITES_TO_VERIFY_ONLY];

// Load current sites.json
const sitesPath = path.join(__dirname, '..', 'data', 'sites.json');
const allSites = JSON.parse(fs.readFileSync(sitesPath, 'utf8'));
const currentSites = allSites.filter(s => ALL_SITE_CODES.includes(s.site_code));

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function geocodeCensus(address) {
  const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&format=json`;
  const resp = await fetch(url);
  const data = await resp.json();
  const matches = data?.result?.addressMatches;
  if (matches && matches.length > 0) {
    const m = matches[0];
    return {
      lat: m.coordinates.y,
      lon: m.coordinates.x,
      matched: m.matchedAddress,
      source: 'census'
    };
  }
  return null;
}

async function geocodeNominatim(address) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=us`;
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'StormScout/1.0 (site-verification)' }
  });
  const data = await resp.json();
  if (data && data.length > 0) {
    return {
      lat: parseFloat(data[0].lat),
      lon: parseFloat(data[0].lon),
      matched: data[0].display_name,
      source: 'nominatim'
    };
  }
  return null;
}

async function fetchNOAA(lat, lon) {
  const url = `https://api.weather.gov/points/${lat},${lon}`;
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'StormScout/1.0 (site-verification)', 'Accept': 'application/geo+json' }
  });
  if (!resp.ok) {
    console.error(`  NOAA /points failed for ${lat},${lon}: ${resp.status}`);
    return null;
  }
  const data = await resp.json();
  const props = data?.properties;
  if (!props) return null;

  const cwa = props.cwa || null;
  const forecastZone = props.forecastZone || '';
  const countyUrl = props.county || '';

  // Extract UGC zone code from forecastZone URL
  const zoneMatch = forecastZone.match(/\/zones\/forecast\/(\w+)$/);
  const zoneCode = zoneMatch ? zoneMatch[1] : null;

  // Extract county FIPS and convert to UGC county code
  const countyMatch = countyUrl.match(/\/zones\/county\/(\w+)$/);
  const countyCode = countyMatch ? countyMatch[1] : null;

  // Get county name
  let countyName = null;
  if (countyUrl) {
    await sleep(300);
    try {
      const countyResp = await fetch(countyUrl, {
        headers: { 'User-Agent': 'StormScout/1.0 (site-verification)', 'Accept': 'application/geo+json' }
      });
      if (countyResp.ok) {
        const countyData = await countyResp.json();
        countyName = countyData?.properties?.name || null;
      }
    } catch (e) {
      console.error(`  Failed to fetch county name: ${e.message}`);
    }
  }

  return {
    cwa,
    ugc_codes: [zoneCode, countyCode].filter(Boolean),
    county: countyName
  };
}

function determineRegion(state) {
  const regions = {
    'Northeast': ['CT','ME','MA','NH','RI','VT','NJ','NY','PA'],
    'Mid-Atlantic': ['DE','MD','VA','WV','DC'],
    'Southeast': ['AL','FL','GA','KY','MS','NC','SC','TN'],
    'South Central': ['AR','LA','OK','TX'],
    'Midwest': ['IL','IN','IA','MI','MN','MO','OH','WI'],
    'Great Plains': ['KS','NE','ND','SD'],
    'Mountain': ['CO','ID','MT','NV','UT','WY'],
    'Southwest': ['AZ','NM'],
    'Pacific': ['CA','OR','WA'],
    'Non-Contiguous': ['AK','HI','PR','GU','VI','AS','MP']
  };
  // NY is tricky - NYC sites use Mid-Atlantic in our data
  if (state === 'NY') return 'Mid-Atlantic';
  for (const [region, states] of Object.entries(regions)) {
    if (states.includes(state)) return region;
  }
  return 'Unknown';
}

async function main() {
  console.log('=== Storm Scout Site Verification ===\n');

  const results = [];

  // Step 1: Geocode the 4 imprecise sites
  console.log('--- Geocoding 4 imprecise addresses ---\n');
  for (const office of SITES_TO_GEOCODE) {
    const current = currentSites.find(s => s.site_code === office.site_code);
    console.log(`[${office.site_code}] ${current.name}`);
    console.log(`  Address: ${office.address}`);
    console.log(`  Current coords: ${current.latitude}, ${current.longitude}`);

    let geo = await geocodeCensus(office.address);
    if (!geo) {
      console.log('  Census: no match, trying Nominatim...');
      await sleep(1100);
      geo = await geocodeNominatim(office.address);
    }

    if (geo) {
      console.log(`  Geocoded (${geo.source}): ${geo.lat}, ${geo.lon}`);
      console.log(`  Matched: ${geo.matched}`);
      results.push({ site_code: office.site_code, lat: geo.lat, lon: geo.lon, source: geo.source, needs_geocode: true });
    } else {
      console.log('  *** FAILED to geocode - keeping current coordinates ***');
      results.push({ site_code: office.site_code, lat: current.latitude, lon: current.longitude, source: 'unchanged', needs_geocode: true });
    }
    await sleep(500);
    console.log();
  }

  // Step 2: Add the 5 verify-only sites with their current coords
  for (const code of SITES_TO_VERIFY_ONLY) {
    const current = currentSites.find(s => s.site_code === code);
    results.push({ site_code: code, lat: current.latitude, lon: current.longitude, source: 'existing', needs_geocode: false });
  }

  // Step 3: Verify all 9 sites against NOAA /points
  console.log('--- Verifying all 9 offices against NOAA /points ---\n');
  const verified = [];

  for (const r of results) {
    const current = currentSites.find(s => s.site_code === r.site_code);
    console.log(`[${r.site_code}] ${current.name} (${r.lat}, ${r.lon})`);

    const noaa = await fetchNOAA(r.lat, r.lon);
    await sleep(500);

    if (!noaa) {
      console.log('  *** NOAA lookup failed - keeping current data ***');
      verified.push({ ...current, latitude: r.lat, longitude: r.lon, _source: r.source });
      console.log();
      continue;
    }

    const region = determineRegion(current.state);

    const entry = {
      site_code: current.site_code,
      name: current.name,
      city: current.city,
      state: current.state,
      latitude: parseFloat(r.lat.toFixed(7)),
      longitude: parseFloat(r.lon.toFixed(7)),
      region: region,
      cwa: noaa.cwa,
      county: noaa.county || current.county,
      ugc_codes: noaa.ugc_codes.length > 0 ? noaa.ugc_codes : current.ugc_codes,
      _source: r.source
    };

    // Compare and flag differences
    const diffs = [];
    if (Math.abs(entry.latitude - current.latitude) > 0.001) diffs.push(`lat: ${current.latitude} → ${entry.latitude}`);
    if (Math.abs(entry.longitude - current.longitude) > 0.001) diffs.push(`lon: ${current.longitude} → ${entry.longitude}`);
    if (entry.county !== current.county) diffs.push(`county: ${current.county} → ${entry.county}`);
    if (entry.cwa !== current.cwa) diffs.push(`cwa: ${current.cwa} → ${entry.cwa}`);
    if (JSON.stringify(entry.ugc_codes) !== JSON.stringify(current.ugc_codes)) diffs.push(`ugc: ${JSON.stringify(current.ugc_codes)} → ${JSON.stringify(entry.ugc_codes)}`);
    if (entry.region !== current.region) diffs.push(`region: ${current.region} → ${entry.region}`);

    if (diffs.length > 0) {
      console.log(`  ⚠️  CHANGES DETECTED:`);
      diffs.forEach(d => console.log(`    ${d}`));
    } else {
      console.log(`  ✓ No changes needed`);
    }

    verified.push(entry);
    console.log();
  }

  // Step 4: Summary
  console.log('=== VERIFICATION SUMMARY ===\n');
  const changed = verified.filter((v, i) => {
    const c = currentSites.find(s => s.site_code === v.site_code);
    return Math.abs(v.latitude - c.latitude) > 0.001 ||
           Math.abs(v.longitude - c.longitude) > 0.001 ||
           v.county !== c.county ||
           v.cwa !== c.cwa ||
           JSON.stringify(v.ugc_codes) !== JSON.stringify(c.ugc_codes) ||
           v.region !== c.region;
  });

  const unchanged = verified.filter(v => !changed.find(c => c.site_code === v.site_code));

  console.log(`Sites verified: ${verified.length}`);
  console.log(`Sites with changes: ${changed.length}`);
  console.log(`Sites unchanged: ${unchanged.length}`);

  if (changed.length > 0) {
    console.log('\nChanged offices:');
    changed.forEach(s => console.log(`  ${s.site_code} ${s.name} (source: ${s._source})`));
  }

  // Write verified data
  const outputPath = path.join(__dirname, '..', 'data', 'verified-sites.json');
  const cleanVerified = verified.map(({ _source, ...rest }) => rest);
  fs.writeFileSync(outputPath, JSON.stringify(cleanVerified, null, 2) + '\n');
  console.log(`\nVerified data written to: ${outputPath}`);
}

main().catch(console.error);
