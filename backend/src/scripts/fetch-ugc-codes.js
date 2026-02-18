/**
 * Fetch UGC Codes from NOAA for All Sites
 * 
 * This script queries the NOAA /points API for each site's coordinates
 * and extracts the forecast zone and county UGC codes.
 * 
 * Usage: node src/scripts/fetch-ugc-codes.js
 * Output: Creates ugc-codes-output.json in the data directory
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Configuration
const OUTPUT_FILE = path.join(__dirname, '../data/ugc-codes-output.json');
const DELAY_MS = 500; // 500ms between requests to respect NOAA rate limits
const USER_AGENT = process.env.NOAA_API_USER_AGENT || 'StormScout/1.0 (ugc-fetch@your-domain.example.com)';

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Extract UGC code from NOAA zone URL
 * e.g., "https://api.weather.gov/zones/forecast/MNZ060" -> "MNZ060"
 */
function extractUGCFromUrl(url) {
  if (!url) return null;
  const match = url.match(/\/([A-Z]{2}[CZ]\d{3})$/);
  return match ? match[1] : null;
}

/**
 * Fetch UGC codes for a single site from NOAA /points API
 */
async function fetchUGCForSite(site) {
  const url = `https://api.weather.gov/points/${site.latitude},${site.longitude}`;
  
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/geo+json'
      },
      timeout: 10000
    });
    
    const props = response.data.properties;
    
    // Extract UGC codes from URLs
    const forecastZone = extractUGCFromUrl(props.forecastZone);
    const countyZone = extractUGCFromUrl(props.county);
    const fireWeatherZone = extractUGCFromUrl(props.fireWeatherZone);
    
    // Get county name from relativeLocation
    const countyName = props.relativeLocation?.properties?.city 
      ? `${props.relativeLocation.properties.city} area`
      : null;
    
    // Get the actual county from the county URL by fetching zone details
    let actualCountyName = null;
    if (props.county) {
      try {
        const countyResponse = await axios.get(props.county, {
          headers: { 'User-Agent': USER_AGENT },
          timeout: 10000
        });
        actualCountyName = countyResponse.data.properties?.name;
      } catch (e) {
        // Ignore errors fetching county name
      }
    }
    
    return {
      site_code: site.site_code,
      site_id: site.id,
      name: site.name,
      city: site.city,
      state: site.state,
      latitude: site.latitude,
      longitude: site.longitude,
      ugc_codes: [forecastZone, countyZone].filter(Boolean),
      forecast_zone: forecastZone,
      county_zone: countyZone,
      fire_weather_zone: fireWeatherZone,
      county_name: actualCountyName,
      cwa: props.cwa, // County Warning Area (NWS office)
      success: true
    };
  } catch (error) {
    console.error(`  ✗ Error fetching UGC for ${site.site_code} (${site.name}): ${error.message}`);
    return {
      site_code: site.site_code,
      site_id: site.id,
      name: site.name,
      city: site.city,
      state: site.state,
      latitude: site.latitude,
      longitude: site.longitude,
      ugc_codes: [],
      success: false,
      error: error.message
    };
  }
}

/**
 * Main function to fetch UGC codes for all sites
 */
async function main() {
  console.log('═══ Fetching UGC Codes from NOAA ═══\n');
  
  // Load sites from JSON file (or could use database)
  const sitesFile = path.join(__dirname, '../data/sites.json');
  
  if (!fs.existsSync(sitesFile)) {
    console.error('Error: sites.json not found at', sitesFile);
    process.exit(1);
  }
  
  const sites = JSON.parse(fs.readFileSync(sitesFile, 'utf8'));
  console.log(`Loaded ${sites.length} sites from sites.json`);
  console.log(`Using User-Agent: ${USER_AGENT}`);
  console.log(`Delay between requests: ${DELAY_MS}ms`);
  console.log(`Estimated time: ~${Math.ceil(sites.length * DELAY_MS / 1000 / 60)} minutes\n`);
  
  const results = [];
  let successCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < sites.length; i++) {
    const site = sites[i];
    const progress = `[${i + 1}/${sites.length}]`;
    
    process.stdout.write(`${progress} Fetching ${site.site_code} (${site.name}, ${site.state})...`);
    
    const result = await fetchUGCForSite(site);
    results.push(result);
    
    if (result.success) {
      successCount++;
      console.log(` ✓ ${result.ugc_codes.join(', ')}`);
    } else {
      errorCount++;
      console.log(` ✗ Failed`);
    }
    
    // Rate limiting delay (skip on last item)
    if (i < sites.length - 1) {
      await sleep(DELAY_MS);
    }
  }
  
  // Write results to file
  const output = {
    generated_at: new Date().toISOString(),
    total_sites: sites.length,
    successful: successCount,
    errors: errorCount,
    sites: results
  };
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  
  console.log('\n═══ Fetch Complete ═══');
  console.log(`Success: ${successCount}/${sites.length}`);
  console.log(`Errors: ${errorCount}`);
  console.log(`Output saved to: ${OUTPUT_FILE}`);
  
  // Show sample of results
  console.log('\n═══ Sample Results ═══');
  const sample = results.filter(r => r.success).slice(0, 5);
  sample.forEach(r => {
    console.log(`  ${r.site_code} (${r.city}, ${r.state}): ${r.ugc_codes.join(', ')}`);
  });
  
  // Show any errors
  const errors = results.filter(r => !r.success);
  if (errors.length > 0) {
    console.log('\n═══ Sites with Errors ═══');
    errors.forEach(r => {
      console.log(`  ${r.site_code} (${r.city}, ${r.state}): ${r.error}`);
    });
  }
}

main().catch(console.error);
