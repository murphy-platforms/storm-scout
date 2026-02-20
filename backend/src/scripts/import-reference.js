/**
 * Import ProInsights Reference CSV into site_reference table
 * 
 * Usage: node src/scripts/import-reference.js /path/to/proinsights.csv
 * 
 * This script:
 * 1. Reads the ProInsights CSV file
 * 2. Converts full state names to 2-letter abbreviations
 * 3. TRUNCATEs the site_reference table
 * 4. Bulk INSERTs all rows
 */

const fs = require('fs');
const path = require('path');
const { initDatabase, getDatabase, closeDatabase } = require('../config/database');

// State name to abbreviation mapping
const STATE_ABBREV = {
  'ALABAMA': 'AL', 'ALASKA': 'AK', 'ARIZONA': 'AZ', 'ARKANSAS': 'AR',
  'CALIFORNIA': 'CA', 'COLORADO': 'CO', 'CONNECTICUT': 'CT', 'DELAWARE': 'DE',
  'FLORIDA': 'FL', 'GEORGIA': 'GA', 'HAWAII': 'HI', 'IDAHO': 'ID',
  'ILLINOIS': 'IL', 'INDIANA': 'IN', 'IOWA': 'IA', 'KANSAS': 'KS',
  'KENTUCKY': 'KY', 'LOUISIANA': 'LA', 'MAINE': 'ME', 'MARYLAND': 'MD',
  'MASSACHUSETTS': 'MA', 'MICHIGAN': 'MI', 'MINNESOTA': 'MN',
  'MISSISSIPPI': 'MS', 'MISSOURI': 'MO', 'MONTANA': 'MT', 'NEBRASKA': 'NE',
  'NEVADA': 'NV', 'NEW HAMPSHIRE': 'NH', 'NEW JERSEY': 'NJ',
  'NEW MEXICO': 'NM', 'NEW YORK': 'NY', 'NORTH CAROLINA': 'NC',
  'NORTH DAKOTA': 'ND', 'OHIO': 'OH', 'OKLAHOMA': 'OK', 'OREGON': 'OR',
  'PENNSYLVANIA': 'PA', 'RHODE ISLAND': 'RI', 'SOUTH CAROLINA': 'SC',
  'SOUTH DAKOTA': 'SD', 'TENNESSEE': 'TN', 'TEXAS': 'TX', 'UTAH': 'UT',
  'VERMONT': 'VT', 'VIRGINIA': 'VA', 'WASHINGTON': 'WA',
  'WEST VIRGINIA': 'WV', 'WISCONSIN': 'WI', 'WYOMING': 'WY',
  'WASHINGTON, DC': 'DC', 'PUERTO RICO': 'PR', 'GUAM': 'GU',
  'U.S. VIRGIN ISLANDS': 'VI'
};

/**
 * Parse a CSV line handling quoted fields with commas
 * @param {string} line - CSV line
 * @returns {string[]} Array of field values
 */
function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

/**
 * Convert full state name to 2-letter abbreviation
 * @param {string} stateName - Full state name
 * @returns {string} 2-letter abbreviation or original if not found
 */
function toStateAbbrev(stateName) {
  if (!stateName) return '';
  const upper = stateName.trim().toUpperCase();
  return STATE_ABBREV[upper] || upper;
}

async function importReference() {
  const csvPath = process.argv[2];

  if (!csvPath) {
    console.error('Usage: node src/scripts/import-reference.js /path/to/proinsights.csv');
    process.exit(1);
  }

  if (!fs.existsSync(csvPath)) {
    console.error(`File not found: ${csvPath}`);
    process.exit(1);
  }

  console.log(`\nImporting ProInsights reference data from:\n  ${csvPath}\n`);

  // Read and parse CSV
  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);

  if (lines.length < 2) {
    console.error('CSV file appears empty or has no data rows');
    process.exit(1);
  }

  // Parse header
  const headers = parseCSVLine(lines[0]);
  console.log(`  CSV columns: ${headers.length}`);
  console.log(`  Data rows: ${lines.length - 1}`);

  // Map header names to indices
  const colIndex = {};
  headers.forEach((h, i) => { colIndex[h.trim()] = i; });

  // Validate required columns exist
  const required = ['SiteCode', 'ParentSiteCode', 'City', 'StateProvince'];
  for (const col of required) {
    if (colIndex[col] === undefined) {
      console.error(`Missing required column: ${col}`);
      console.error(`Found columns: ${headers.join(', ')}`);
      process.exit(1);
    }
  }

  // Parse data rows
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    if (fields.length < headers.length) continue; // skip malformed rows

    const stateProvince = fields[colIndex['StateProvince']] || '';
    const stateAbbrev = toStateAbbrev(stateProvince);

    rows.push({
      site_code: fields[colIndex['SiteCode']] || '',
      parent_site_code: fields[colIndex['ParentSiteCode']] || '',
      metro_area_name: (fields[colIndex['MetroAreaName']] || '').toUpperCase(),
      site_name: fields[colIndex['SiteName']] || '',
      city: fields[colIndex['City']] || '',
      state_province: stateProvince,
      state: stateAbbrev,
      channel_engagement_manager: fields[colIndex['ChannelEngagementManager']] || '',
      country: fields[colIndex['Country']] || '',
      sub_region: fields[colIndex['SubRegion']] || '',
      region: fields[colIndex['Region']] || '',
      site_status: fields[colIndex['SiteStatus']] || '',
      channel: fields[colIndex['Channel']] || '',
      management_type: fields[colIndex['ManagementType']] || '',
      delivery_type: fields[colIndex['DeliveryType']] || '',
      cost_center: fields[colIndex['CostCenter']] || '',
      workstations_active: parseInt(fields[colIndex['WorkstationsActive']], 10) || 0,
      ta_workstations_active: parseInt(fields[colIndex['TAWorkstationsActive']], 10) || 0
    });
  }

  console.log(`  Parsed rows: ${rows.length}\n`);

  // Connect to database
  await initDatabase();
  const db = getDatabase();

  // TRUNCATE and INSERT
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    await connection.query('TRUNCATE TABLE site_reference');
    console.log('  ✓ Truncated site_reference table');

    const sql = `
      INSERT INTO site_reference (
        site_code, parent_site_code, metro_area_name, site_name, city,
        state_province, state, channel_engagement_manager, country, sub_region,
        region, site_status, channel, management_type, delivery_type,
        cost_center, workstations_active, ta_workstations_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    let inserted = 0;
    for (const row of rows) {
      await connection.query(sql, [
        row.site_code, row.parent_site_code, row.metro_area_name, row.site_name, row.city,
        row.state_province, row.state, row.channel_engagement_manager, row.country, row.sub_region,
        row.region, row.site_status, row.channel, row.management_type, row.delivery_type,
        row.cost_center, row.workstations_active, row.ta_workstations_active
      ]);
      inserted++;
    }

    await connection.commit();
    console.log(`  ✓ Inserted ${inserted} rows into site_reference`);

    // Quick summary
    const [countResult] = await db.query('SELECT COUNT(DISTINCT parent_site_code) as distinct_parents FROM site_reference');
    console.log(`  ✓ Distinct parent site codes: ${countResult[0].distinct_parents}`);

  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  console.log('\n✓ Import complete!\n');
  console.log('Next step: node src/scripts/sync-reference.js --dry-run');
}

importReference()
  .catch(error => {
    console.error('\n✗ Import failed:', error.message);
    process.exit(1);
  })
  .finally(() => {
    closeDatabase();
  });
