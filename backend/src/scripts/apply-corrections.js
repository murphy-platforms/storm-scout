#!/usr/bin/env node
/**
 * apply-corrections.js
 * Applies verified coordinate corrections, updates Miami UGC zone,
 * removes child site 6753, and generates deployment SQL.
 */

const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const sitesPath = path.join(dataDir, 'sites.json');

// Corrections from verification
const corrections = {
    /* redacted */,
    /* redacted latitude 25.7832367, longitude: -80.3003754, ugc_codes: ['FLZ074', 'FLC086'] },
    5298: { latitude: 33.8579818, longitude: -98.563651 },
    /* redacted */
};

const REMOVE_CODE = '/* redacted */';

// Load sites
let offices = JSON.parse(fs.readFileSync(sitesPath, 'utf8'));
console.log(`Loaded ${offices.length} offices\n`);

// Apply corrections
const sqlStatements = [];
for (const [code, updates] of Object.entries(corrections)) {
    const office = offices.find((s) => s.site_code === code);
    if (!office) {
        console.error(`Site ${code} not found!`);
        continue;
    }

    const changes = [];
    const setClauses = [];

    if (updates.latitude !== undefined) {
        changes.push(`lat: ${office.latitude} → ${updates.latitude}`);
        office.latitude = updates.latitude;
        setClauses.push(`latitude = ${updates.latitude}`);
    }
    if (updates.longitude !== undefined) {
        changes.push(`lon: ${office.longitude} → ${updates.longitude}`);
        office.longitude = updates.longitude;
        setClauses.push(`longitude = ${updates.longitude}`);
    }
    if (updates.ugc_codes !== undefined) {
        changes.push(`ugc: ${JSON.stringify(office.ugc_codes)} → ${JSON.stringify(updates.ugc_codes)}`);
        office.ugc_codes = updates.ugc_codes;
        setClauses.push(`ugc_codes = '${JSON.stringify(updates.ugc_codes)}'`);
    }

    console.log(`[${code}] ${office.name}: ${changes.join(', ')}`);

    if (setClauses.length > 0) {
        sqlStatements.push(
            `UPDATE sites SET ${setClauses.join(', ')}, updated_at = NOW() WHERE site_code = '${code}';`
        );
    }
}

// Remove child office
const removeIdx = offices.findIndex((s) => s.site_code === REMOVE_SITE);
if (removeIdx >= 0) {
    console.log(`\nRemoving office ${REMOVE_SITE}: ${offices[removeIdx].name}`);
    offices.splice(removeIdx, 1);
    sqlStatements.push(`DELETE FROM sites WHERE site_code = '${REMOVE_SITE}';`);
} else {
    console.error(`Site ${REMOVE_SITE} not found for removal!`);
}

// Re-sort by latitude (ascending, matching existing sort order)
offices.sort((a, b) => a.latitude - b.latitude);

// Write updated sites.json
fs.writeFileSync(sitesPath, JSON.stringify(offices, null, 2) + '\n');
console.log(`\nWrote ${offices.length} offices to sites.json`);

// Write SQL file
const sqlHeader = `-- Storm Scout: Site corrections and cleanup
-- Generated: ${new Date().toISOString()}
-- Updates coordinates for 4 sites verified against physical addresses
-- Removes child office (parent office, same physical address)

`;
const sqlContent = sqlHeader + sqlStatements.join('\n\n') + '\n';
const sqlPath = path.join(dataDir, 'site-corrections.sql');
fs.writeFileSync(sqlPath, sqlContent);
console.log(`Wrote SQL to site-corrections.sql`);

// Regenerate output (offices)
const newOfficeCodes = [/* redacted */];
const newSites = newSiteCodes.map((code) => {
    const s = offices.find((x) => x.site_code === code);
    return {
        site_code: s.site_code,
        name: s.name,
        city: s.city,
        state: s.state,
        latitude: s.latitude,
        longitude: s.longitude,
        region: s.region,
        cwa: s.cwa,
        county: s.county,
        ugc_codes: s.ugc_codes
    };
});
fs.writeFileSync(path.join(dataDir, 'new-sites-output.json'), JSON.stringify(newSites, null, 2) + '\n');
console.log('Regenerated new-sites-output.json (9 sites)');

// Regenerate SQL (offices)
const insertHeader = `-- Storm Scout: INSERT new sites (corrected)
-- Generated: ${new Date().toISOString()}
-- offices (6753 removed as child office)

`;
const inserts = newSites
    .map((s) => {
        const ugc = JSON.stringify(s.ugc_codes).replace(/"/g, '\\"');
        return `INSERT IGNORE INTO sites (site_code, name, city, state, county, ugc_codes, cwa, latitude, longitude, region)
VALUES ('${s.site_code}', '${s.name}', '${s.city}', '${s.state}', '${s.county}', '${JSON.stringify(s.ugc_codes)}', '${s.cwa}', ${s.latitude}, ${s.longitude}, '${s.region}');`;
    })
    .join('\n\n');
fs.writeFileSync(path.join(dataDir, 'new-sites-insert.sql'), insertHeader + inserts + '\n');
console.log('Regenerated new-sites-insert.sql (9 sites)');

// Summary
console.log('\n=== SUMMARY ===');
console.log(`Total offices: ${offices.length}`);
console.log(`Sites updated: ${Object.keys(corrections).length}`);
console.log(`Sites removed: 1 (${REMOVE_SITE})`);
console.log(`SQL statements: ${sqlStatements.length}`);
console.log('\nSQL to deploy:');
sqlStatements.forEach((s) => console.log(`  ${s}`));
