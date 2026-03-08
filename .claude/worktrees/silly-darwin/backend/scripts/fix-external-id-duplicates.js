/**
 * Fix External ID Duplicates
 * Remove duplicate advisories with same external_id before adding unique constraint
 * Strategy: Keep most recent advisory (highest last_updated), delete older ones
 */

const { getDatabase } = require('../src/config/database');

async function fixExternalIdDuplicates() {
    const db = getDatabase();
    
    console.log('\n═══ External ID Duplicate Cleanup ═══\n');
    
    // Find all external_ids that have duplicates
    const [duplicates] = await db.query(`
        SELECT 
            external_id,
            COUNT(*) as duplicate_count,
            GROUP_CONCAT(id ORDER BY last_updated DESC, id DESC) as advisory_ids,
            GROUP_CONCAT(site_code) as site_codes,
            MAX(last_updated) as most_recent_update
        FROM advisories
        GROUP BY external_id
        HAVING duplicate_count > 1
        ORDER BY duplicate_count DESC
    `);
    
    console.log(`Found ${duplicates.length} external_ids with duplicates\n`);
    
    if (duplicates.length === 0) {
        console.log('✅ No duplicates found. Database is clean!');
        process.exit(0);
    }
    
    // Calculate statistics
    let totalDuplicatesToRemove = 0;
    for (const dup of duplicates) {
        totalDuplicatesToRemove += (dup.duplicate_count - 1); // Keep one, remove others
    }
    
    console.log(`Total advisories with duplicate external_id: ${totalDuplicatesToRemove + duplicates.length}`);
    console.log(`Will remove: ${totalDuplicatesToRemove} duplicate entries`);
    console.log(`Will keep: ${duplicates.length} unique entries\n`);
    
    // Show top 10 worst offenders
    console.log('Top 10 Duplicate External IDs:\n');
    for (let i = 0; i < Math.min(10, duplicates.length); i++) {
        const dup = duplicates[i];
        const ids = dup.advisory_ids.split(',');
        console.log(`${i + 1}. External ID: ${dup.external_id.substring(0, 60)}...`);
        console.log(`   Count: ${dup.duplicate_count} duplicates`);
        console.log(`   Site codes: ${dup.site_codes}`);
        console.log(`   Advisory IDs: ${ids[0]} (KEEP), ${ids.slice(1).join(', ')} (DELETE)`);
        console.log('');
    }
    
    // Confirmation prompt
    console.log('\n⚠️  WARNING: This will DELETE duplicate advisory records!');
    console.log('Strategy: Keep most recent (by last_updated), delete older entries\n');
    
    // In production, you'd want a confirmation prompt here
    // For now, we'll proceed automatically
    
    console.log('Starting cleanup...\n');
    
    let deletedCount = 0;
    let keptCount = 0;
    
    // Process each duplicate external_id
    for (const dup of duplicates) {
        const ids = dup.advisory_ids.split(',').map(id => parseInt(id));
        const keepId = ids[0]; // First ID (most recent)
        const deleteIds = ids.slice(1); // Rest to delete
        
        if (deleteIds.length > 0) {
            const [result] = await db.query(
                `DELETE FROM advisories WHERE id IN (${deleteIds.join(',')})` 
            );
            
            deletedCount += result.affectedRows;
            keptCount++;
            
            if (deletedCount % 10 === 0) {
                console.log(`Progress: Deleted ${deletedCount} duplicates, kept ${keptCount} unique entries...`);
            }
        }
    }
    
    console.log('\n═══ Cleanup Complete ═══\n');
    console.log(`✅ Deleted: ${deletedCount} duplicate entries`);
    console.log(`✅ Kept: ${keptCount} unique entries`);
    console.log(`✅ Total external_ids now unique: ${keptCount}\n`);
    
    // Verify no duplicates remain
    const [remaining] = await db.query(`
        SELECT COUNT(*) as count
        FROM (
            SELECT external_id
            FROM advisories
            GROUP BY external_id
            HAVING COUNT(*) > 1
        ) as duplicates
    `);
    
    if (remaining[0].count === 0) {
        console.log('✅ Verification passed: No duplicate external_ids remain');
        console.log('\nReady to add unique constraint on external_id column.\n');
    } else {
        console.log(`❌ WARNING: ${remaining[0].count} duplicate external_ids still remain!`);
        console.log('Re-run this script or investigate manually.\n');
        process.exit(1);
    }
    
    process.exit(0);
}

// Initialize database and run
const { initDatabase } = require('../src/config/database');
initDatabase().then(fixExternalIdDuplicates).catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
