/**
 * Update Database with UGC Codes
 *
 * This script reads the UGC codes fetched from NOAA and updates the offices table.
 * It also updates the offices.json file for future seeding.
 *
 * Usage: node src/scripts/update-ugc-codes.js [--dry-run]
 * Options:
 *   --dry-run  Show what would be updated without making changes
 *
 * @generated AI-authored (Claude, Warp) — vanilla JS by design
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { initDatabase, getDatabase } = require('../config/database');

// Configuration
const INPUT_FILE = path.join(__dirname, '../data/ugc-codes-output.json');
const SITES_JSON = path.join(__dirname, '../data/sites.json');

const DRY_RUN = process.argv.includes('--dry-run');

/**
 * Main function to update database with UGC codes
 */
async function main() {
    console.log('═══ Updating Offices with UGC Codes ═══\n');

    if (DRY_RUN) {
        console.log('🔍 DRY RUN MODE - No changes will be made\n');
    }

    // Load fetched UGC data
    if (!fs.existsSync(INPUT_FILE)) {
        console.error('Error: UGC codes file not found at', INPUT_FILE);
        console.error('Run fetch-ugc-codes.js first to generate this file.');
        process.exit(1);
    }

    const ugcData = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
    console.log(`Loaded UGC data from ${ugcData.generated_at}`);
    console.log(
        `Total offices: ${ugcData.total_sites}, Successful: ${ugcData.successful}, Errors: ${ugcData.errors}\n`
    );

    // Filter to successful offices only
    const sitesToUpdate = ugcData.sites.filter((s) => s.success && s.ugc_codes.length > 0);
    console.log(`Offices with valid UGC codes: ${sitesToUpdate.length}\n`);

    if (sitesToUpdate.length === 0) {
        console.log('No offices to update. Exiting.');
        process.exit(0);
    }

    // Connect to database
    await initDatabase();
    const db = getDatabase();
    let updatedCount = 0;
    let errorCount = 0;

    try {
        // Update each office in the database
        console.log('Updating database...\n');

        for (const site of sitesToUpdate) {
            const ugcCodesJson = JSON.stringify(site.ugc_codes);

            if (DRY_RUN) {
                console.log(
                    `  [DRY RUN] ${site.site_code}: ugc_codes=${ugcCodesJson}, county=${site.county_name || 'null'}`
                );
                updatedCount++;
                continue;
            }

            try {
                const [result] = await db.query(
                    `UPDATE sites 
           SET ugc_codes = ?, county = ?
           WHERE site_code = ?`,
                    [ugcCodesJson, site.county_name, site.site_code]
                );

                if (result.affectedRows > 0) {
                    updatedCount++;
                    console.log(`  ✓ ${site.site_code} (${site.city}, ${site.state}): ${site.ugc_codes.join(', ')}`);
                } else {
                    console.log(`  ⚠ ${site.site_code}: Office not found in database`);
                }
            } catch (error) {
                errorCount++;
                console.error(`  ✗ ${site.site_code}: ${error.message}`);
            }
        }

        console.log('\n═══ Database Update Complete ═══');
        console.log(`Updated: ${updatedCount}`);
        console.log(`Errors: ${errorCount}`);

        // Also update sites.json for future seeding
        if (!DRY_RUN) {
            console.log('\n═══ Updating offices.json ═══');

            const sitesJson = JSON.parse(fs.readFileSync(SITES_JSON, 'utf8'));
            let jsonUpdated = 0;

            for (const site of sitesToUpdate) {
                const siteInJson = sitesJson.find((s) => s.site_code === site.site_code);
                if (siteInJson) {
                    siteInJson.ugc_codes = site.ugc_codes;
                    siteInJson.county = site.county_name;
                    jsonUpdated++;
                }
            }

            // Write updated sites.json
            fs.writeFileSync(SITES_JSON, JSON.stringify(sitesJson, null, 2));
            console.log(`Updated ${jsonUpdated} offices in offices.json`);
        }

        // Show the 4 problem offices specifically
        console.log('\n═══ Verification: Problem Offices ═══');
        const problemSites = ['0064', '5404', '4400', '4403'];

        for (const siteCode of problemSites) {
            const site = sitesToUpdate.find((s) => s.site_code === siteCode);
            if (site) {
                console.log(`  ${site.site_code} (${site.city}, ${site.state}):`);
                console.log(`    Forecast Zone: ${site.forecast_zone}`);
                console.log(`    County Zone: ${site.county_zone}`);
                console.log(`    UGC Codes: ${site.ugc_codes.join(', ')}`);
            }
        }
    } finally {
        await db.end();
    }
}

main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
