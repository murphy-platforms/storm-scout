/**
 * Validate UGC Codes Against NOAA API
 * 
 * This script compares stored UGC codes in the database against fresh data
 * from the NOAA /points API to detect any mismatches or drift.
 * 
 * Usage: node src/scripts/validate-ugc-codes.js [--fix]
 * 
 * Options:
 *   --fix    Automatically update mismatched UGC codes (not implemented yet)
 * 
 * Output: Validation report to console and optional JSON file
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Configuration
const OUTPUT_FILE = path.join(__dirname, '../data/ugc-validation-report.json');
const DELAY_MS = 500; // 500ms between requests to respect NOAA rate limits
const USER_AGENT = process.env.NOAA_API_USER_AGENT || 'StormScout/1.0 (validation@your-domain.example.com)';

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
 * Validate UGC code format
 * Valid format: SSXNNN (e.g., MNZ060, MNC053)
 */
function isValidUGCFormat(code) {
  if (!code) return false;
  return /^[A-Z]{2}[ZC]\d{3}$/.test(code);
}

/**
 * Fetch expected UGC codes for a site from NOAA /points API
 */
async function fetchExpectedUGC(site) {
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
    
    return {
      forecastZone: extractUGCFromUrl(props.forecastZone),
      countyZone: extractUGCFromUrl(props.county),
      relativeLocation: props.relativeLocation?.properties || null,
      cwa: props.cwa,
      success: true
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Compare stored UGC codes with expected codes
 */
function compareUGCCodes(stored, expected) {
  const issues = [];
  
  // Parse stored UGC codes (should be JSON array)
  let storedCodes = [];
  try {
    storedCodes = typeof stored.ugc_codes === 'string' 
      ? JSON.parse(stored.ugc_codes) 
      : stored.ugc_codes || [];
  } catch (e) {
    issues.push({
      type: 'PARSE_ERROR',
      message: `Cannot parse ugc_codes: ${stored.ugc_codes}`
    });
    return { match: false, issues };
  }
  
  // Validate format of stored codes
  for (const code of storedCodes) {
    if (!isValidUGCFormat(code)) {
      issues.push({
        type: 'INVALID_FORMAT',
        message: `Invalid UGC format: ${code}`
      });
    }
  }
  
  // Check if expected codes match stored codes
  const expectedCodes = [expected.forecastZone, expected.countyZone].filter(Boolean);
  
  const storedSet = new Set(storedCodes);
  const expectedSet = new Set(expectedCodes);
  
  // Find mismatches
  const missing = expectedCodes.filter(c => !storedSet.has(c));
  const extra = storedCodes.filter(c => !expectedSet.has(c));
  
  if (missing.length > 0) {
    issues.push({
      type: 'MISSING_CODES',
      message: `Missing expected codes: ${missing.join(', ')}`
    });
  }
  
  if (extra.length > 0) {
    issues.push({
      type: 'EXTRA_CODES',
      message: `Extra codes not in NOAA response: ${extra.join(', ')}`
    });
  }
  
  // Check for state mismatch (cross-border sites)
  const storedStates = storedCodes.map(c => c.substring(0, 2));
  const uniqueStates = [...new Set(storedStates)];
  
  if (uniqueStates.length > 0 && !uniqueStates.includes(stored.state)) {
    issues.push({
      type: 'CROSS_STATE',
      severity: 'info',
      message: `UGC codes (${uniqueStates.join(', ')}) differ from site state (${stored.state}) - likely cross-border location`
    });
  }
  
  return {
    match: missing.length === 0 && extra.length === 0,
    storedCodes,
    expectedCodes,
    issues
  };
}

/**
 * Validate data integrity fields
 */
function validateDataIntegrity(site) {
  const issues = [];
  
  // Check ugc_codes is not null/empty
  if (!site.ugc_codes || (Array.isArray(site.ugc_codes) && site.ugc_codes.length === 0)) {
    issues.push({
      type: 'MISSING_UGC',
      severity: 'error',
      message: 'ugc_codes is NULL or empty'
    });
  }
  
  // Check county is not null (field is county_name in ugc-codes-output.json)
  if (!site.county && !site.county_name) {
    issues.push({
      type: 'MISSING_COUNTY',
      severity: 'warning',
      message: 'county is NULL'
    });
  }
  
  // Validate coordinate bounds
  const lat = parseFloat(site.latitude);
  const lon = parseFloat(site.longitude);
  
  if (isNaN(lat) || isNaN(lon)) {
    issues.push({
      type: 'INVALID_COORDINATES',
      severity: 'error',
      message: 'Invalid latitude or longitude'
    });
  } else {
    // Check rough bounds for US territories
    const inContigUS = lat >= 24 && lat <= 49 && lon >= -125 && lon <= -66;
    const inAlaska = lat >= 51 && lat <= 72 && lon >= -180 && lon <= -130;
    const inHawaii = lat >= 18 && lat <= 23 && lon >= -161 && lon <= -154;
    const inPuertoRico = lat >= 17 && lat <= 19 && lon >= -68 && lon <= -65;
    const inGuam = lat >= 13 && lat <= 14 && lon >= 144 && lon <= 146;
    const inUSVI = lat >= 17 && lat <= 19 && lon >= -65 && lon <= -64;
    
    if (!inContigUS && !inAlaska && !inHawaii && !inPuertoRico && !inGuam && !inUSVI) {
      issues.push({
        type: 'COORDINATE_BOUNDS',
        severity: 'warning',
        message: `Coordinates (${lat}, ${lon}) outside expected US bounds`
      });
    }
  }
  
  return issues;
}

/**
 * Main validation function
 */
async function main() {
  const args = process.argv.slice(2);
  const skipApiCheck = args.includes('--quick');
  const saveReport = args.includes('--save');
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('          UGC Code Validation Report - Storm Scout');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  // Load sites from the ugc-codes-output.json (has both stored codes and site info)
  const dataFile = path.join(__dirname, '../data/ugc-codes-output.json');
  
  if (!fs.existsSync(dataFile)) {
    console.error('Error: ugc-codes-output.json not found.');
    console.error('Run fetch-ugc-codes.js first to generate this file.');
    process.exit(1);
  }
  
  const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  const sites = data.sites;
  
  console.log(`Data file generated: ${data.generated_at}`);
  console.log(`Total sites: ${sites.length}`);
  console.log(`Mode: ${skipApiCheck ? 'Quick (data integrity only)' : 'Full (including NOAA API validation)'}\n`);
  
  const report = {
    generated_at: new Date().toISOString(),
    data_file_date: data.generated_at,
    total_sites: sites.length,
    summary: {
      valid: 0,
      warnings: 0,
      errors: 0,
      cross_state: 0
    },
    issues: [],
    sites_with_issues: []
  };
  
  // Phase 1: Data integrity validation (quick, no API calls)
  console.log('─── Phase 1: Data Integrity Validation ───\n');
  
  let integrityIssues = 0;
  for (const site of sites) {
    const issues = validateDataIntegrity(site);
    if (issues.length > 0) {
      integrityIssues++;
      report.sites_with_issues.push({
        site_code: site.site_code,
        name: site.name,
        state: site.state,
        phase: 'integrity',
        issues
      });
      
      const errorIssues = issues.filter(i => i.severity === 'error');
      const warnIssues = issues.filter(i => i.severity === 'warning');
      
      if (errorIssues.length > 0) report.summary.errors++;
      if (warnIssues.length > 0) report.summary.warnings++;
    }
  }
  
  if (integrityIssues === 0) {
    console.log('✓ All sites pass data integrity checks\n');
  } else {
    console.log(`✗ ${integrityIssues} sites have data integrity issues\n`);
  }
  
  // Phase 2: UGC format validation
  console.log('─── Phase 2: UGC Format Validation ───\n');
  
  let formatIssues = 0;
  for (const site of sites) {
    const codes = site.ugc_codes || [];
    for (const code of codes) {
      if (!isValidUGCFormat(code)) {
        formatIssues++;
        console.log(`  ✗ ${site.site_code} (${site.name}): Invalid format - ${code}`);
      }
    }
  }
  
  if (formatIssues === 0) {
    console.log('✓ All UGC codes have valid format (SSXNNN)\n');
  } else {
    console.log(`\n✗ ${formatIssues} codes have invalid format\n`);
    report.summary.errors += formatIssues;
  }
  
  // Phase 3: Cross-state detection
  console.log('─── Phase 3: Cross-State Site Detection ───\n');
  
  const crossStateSites = [];
  for (const site of sites) {
    const codes = site.ugc_codes || [];
    const ugcStates = [...new Set(codes.map(c => c.substring(0, 2)))];
    
    if (ugcStates.length > 0 && !ugcStates.includes(site.state)) {
      crossStateSites.push({
        site_code: site.site_code,
        name: site.name,
        listed_state: site.state,
        ugc_states: ugcStates,
        ugc_codes: codes,
        county: site.county_name
      });
    }
  }
  
  report.summary.cross_state = crossStateSites.length;
  
  if (crossStateSites.length === 0) {
    console.log('✓ No cross-state sites detected\n');
  } else {
    console.log(`ℹ ${crossStateSites.length} sites have UGC codes from different states:\n`);
    console.log('  (This is normal for testing centers located across state lines)\n');
    
    for (const site of crossStateSites) {
      console.log(`  • ${site.site_code} "${site.name}" (${site.listed_state})`);
      console.log(`    UGC: ${site.ugc_codes.join(', ')} → ${site.county}\n`);
    }
  }
  
  // Phase 4: NOAA API validation (optional, takes time)
  if (!skipApiCheck) {
    console.log('─── Phase 4: NOAA API Validation ───\n');
    console.log(`Checking ${sites.length} sites against NOAA API...`);
    console.log(`Estimated time: ~${Math.ceil(sites.length * DELAY_MS / 1000 / 60)} minutes\n`);
    
    let apiMatches = 0;
    let apiMismatches = 0;
    let apiErrors = 0;
    
    for (let i = 0; i < sites.length; i++) {
      const site = sites[i];
      const progress = `[${i + 1}/${sites.length}]`;
      
      process.stdout.write(`${progress} ${site.site_code} (${site.name})... `);
      
      const expected = await fetchExpectedUGC(site);
      
      if (!expected.success) {
        apiErrors++;
        console.log(`✗ API Error: ${expected.error}`);
        report.issues.push({
          site_code: site.site_code,
          type: 'API_ERROR',
          message: expected.error
        });
      } else {
        const comparison = compareUGCCodes(site, expected);
        
        if (comparison.match) {
          apiMatches++;
          console.log('✓ Match');
        } else {
          apiMismatches++;
          console.log('✗ Mismatch');
          console.log(`    Stored: ${comparison.storedCodes.join(', ')}`);
          console.log(`    Expected: ${comparison.expectedCodes.join(', ')}`);
          
          report.issues.push({
            site_code: site.site_code,
            type: 'UGC_MISMATCH',
            stored: comparison.storedCodes,
            expected: comparison.expectedCodes,
            issues: comparison.issues
          });
        }
      }
      
      // Rate limiting delay (skip on last item)
      if (i < sites.length - 1) {
        await sleep(DELAY_MS);
      }
    }
    
    console.log('\n─── API Validation Summary ───');
    console.log(`  Matches: ${apiMatches}`);
    console.log(`  Mismatches: ${apiMismatches}`);
    console.log(`  API Errors: ${apiErrors}\n`);
    
    report.summary.valid = apiMatches;
    report.summary.errors += apiMismatches + apiErrors;
  } else {
    report.summary.valid = sites.length - report.summary.errors - report.summary.warnings;
  }
  
  // Final Summary
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('                      Validation Summary');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  console.log(`  Total Sites:     ${report.total_sites}`);
  console.log(`  Valid:           ${report.summary.valid}`);
  console.log(`  Warnings:        ${report.summary.warnings}`);
  console.log(`  Errors:          ${report.summary.errors}`);
  console.log(`  Cross-State:     ${report.summary.cross_state} (informational)\n`);
  
  if (report.summary.errors === 0 && report.summary.warnings === 0) {
    console.log('✓ All validations passed!\n');
  } else {
    console.log('⚠ Issues detected. Review the report above.\n');
  }
  
  // Save report if requested
  if (saveReport) {
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(report, null, 2));
    console.log(`Report saved to: ${OUTPUT_FILE}\n`);
  }
  
  // Exit with error code if there are errors
  process.exit(report.summary.errors > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Validation failed:', err);
  process.exit(1);
});
