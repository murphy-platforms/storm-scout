/**
 * Generate SQL statements for UGC code updates
 * Usage: node src/scripts/generate-ugc-sql.js > ugc-update.sql
 */

const fs = require('fs');
const path = require('path');

const INPUT_FILE = path.join(__dirname, '../data/ugc-codes-output.json');

const ugcData = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));

console.log('-- UGC Code Update Script');
console.log(`-- Generated: ${new Date().toISOString()}`);
console.log(`-- Total offices: ${ugcData.total_sites}`);
console.log('');

for (const site of ugcData.sites) {
    if (!site.success || site.ugc_codes.length === 0) continue;

    const ugcCodesJson = JSON.stringify(site.ugc_codes).replace(/'/g, "''");
    const countyName = site.county_name ? `'${site.county_name.replace(/'/g, "''")}'` : 'NULL';

    console.log(
        `UPDATE sites SET ugc_codes = '${ugcCodesJson}', county = ${countyName} WHERE site_code = '${site.site_code}';`
    );
}

console.log('');
console.log('-- Verify update');
console.log(
    "SELECT site_code, name, state, ugc_codes, county FROM sites WHERE site_code IN ('0064', '5404', '4400', '4403');"
);
