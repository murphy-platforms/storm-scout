/**
 * Offices CSV Import Script
 * Converts a locations CSV into backend/src/data/offices.json
 *
 * Usage:
 *   node src/scripts/import-usps-offices.js /path/to/usps-locations.csv
 *
 * Expected CSV columns (header row required):
 *   zip, name, city, state, latitude, longitude
 *   Optional: region, county, ugc_codes, cwa
 *
 * Output: backend/src/data/offices.json
 * Format consumed by database.js -> loadOffices()
 */

'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'offices.json');

const REQUIRED_FIELDS = ['zip', 'name', 'city', 'state', 'latitude', 'longitude'];
const OPTIONAL_FIELDS = ['region', 'county', 'ugc_codes', 'cwa'];

function parseCsvLine(line) {
  // RFC 4180-compliant CSV parser: handles quoted fields and "" escaped quotes
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped double-quote inside a quoted field
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

async function importCsv(csvPath) {
  if (!csvPath) {
    console.error('Error: No CSV file path provided.');
    console.error('Usage: node src/scripts/import-usps-offices.js /path/to/usps-locations.csv');
    process.exit(1);
  }

  if (!fs.existsSync(csvPath)) {
    console.error(`Error: File not found: ${csvPath}`);
    process.exit(1);
  }

  const fileStream = fs.createReadStream(csvPath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let headers = null;
  let lineNumber = 0;
  let skipped = 0;
  const offices = [];

  for await (const line of rl) {
    lineNumber++;
    const trimmed = line.trim();
    if (!trimmed) continue;

    const fields = parseCsvLine(trimmed);

    // First non-empty line is the header
    if (!headers) {
      headers = fields.map(h => h.toLowerCase().replace(/\s+/g, '_'));

      // Validate required columns exist
      const missing = REQUIRED_FIELDS.filter(f => !headers.includes(f));
      if (missing.length > 0) {
        console.error(`Error: CSV is missing required columns: ${missing.join(', ')}`);
        console.error(`Found columns: ${headers.join(', ')}`);
        process.exit(1);
      }
      continue;
    }

    // Build row object
    const row = {};
    headers.forEach((h, i) => {
      row[h] = fields[i] !== undefined ? fields[i] : '';
    });

    // Validate required fields
    const missingValues = REQUIRED_FIELDS.filter(f => !row[f] || row[f].trim() === '');
    if (missingValues.length > 0) {
      console.warn(`  Line ${lineNumber}: Skipping row — missing required fields: ${missingValues.join(', ')} (zip: ${row.zip || 'unknown'})`);
      skipped++;
      continue;
    }

    // Validate zip is 5 digits
    const zip = row.zip.trim();
    if (!/^\d{5}$/.test(zip)) {
      console.warn(`  Line ${lineNumber}: Skipping row — zip "${zip}" is not a 5-digit code`);
      skipped++;
      continue;
    }

    // Validate state is 2-letter
    const state = row.state.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(state)) {
      console.warn(`  Line ${lineNumber}: Skipping row — state "${row.state}" is not a 2-letter code (zip: ${zip})`);
      skipped++;
      continue;
    }

    const lat = parseFloat(row.latitude);
    const lon = parseFloat(row.longitude);
    if (isNaN(lat) || isNaN(lon)) {
      console.warn(`  Line ${lineNumber}: Skipping row — invalid lat/lon (zip: ${zip})`);
      skipped++;
      continue;
    }

    // Warn on missing optional fields (once per field, not per row)
    OPTIONAL_FIELDS.forEach(f => {
      if (!headers.includes(f)) {
        // Already warned at header level — skip
      }
    });

    // Build office object
    const site = {
      office_code: zip,
      name: row.name.trim(),
      city: row.city.trim(),
      state,
      latitude: lat,
      longitude: lon,
    };

    if (row.region && row.region.trim()) site.region = row.region.trim();
    if (row.county && row.county.trim()) site.county = row.county.trim();
    if (row.cwa && row.cwa.trim()) site.cwa = row.cwa.trim().toUpperCase();

    // ugc_codes: accept JSON array string or comma-separated values
    if (row.ugc_codes && row.ugc_codes.trim()) {
      const raw = row.ugc_codes.trim();
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          site.ugc_codes = JSON.stringify(parsed);
        } else {
          console.warn(`  Line ${lineNumber}: ugc_codes is not a JSON array for zip ${zip} — skipping ugc_codes`);
        }
      } catch {
        // Try comma-separated
        const codes = raw.split(',').map(c => c.trim()).filter(Boolean);
        if (codes.length > 0) {
          site.ugc_codes = JSON.stringify(codes);
        }
      }
    }

    offices.push(site);
  }

  if (offices.length === 0) {
    console.error('Error: No valid offices found in CSV. Check the file format.');
    process.exit(1);
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(offices, null, 2));

  console.log('\nImport complete:');
  console.log(`  Total rows processed : ${lineNumber - 1}`);
  console.log(`  Offices written      : ${offices.length}`);
  console.log(`  Rows skipped         : ${skipped}`);
  console.log(`  Output               : ${OUTPUT_PATH}`);
}

importCsv(process.argv[2]).catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
