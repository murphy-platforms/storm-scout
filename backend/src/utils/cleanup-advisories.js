/**
 * Advisory Cleanup Utility
 * Removes duplicate and expired advisories from the database
 */

const { initDatabase, getDatabase } = require('../config/database');

/**
 * Remove duplicate advisories
 * Keeps the most recent version of each unique advisory
 * Primary uniqueness: external_id (NOAA alert ID)
 * Fallback uniqueness: site_id + advisory_type + start_time + end_time
 */
async function removeDuplicateAdvisories() {
  const db = getDatabase();
  
  console.log('\n=== Removing Duplicate Advisories ===');
  
  let totalRemoved = 0;
  
  // STEP 1: Find duplicates by external_id (most reliable)
  console.log('Finding duplicates by external_id...');
  const [externalIdDuplicates] = await db.query(`
    SELECT external_id, COUNT(*) as count
    FROM advisories
    WHERE external_id IS NOT NULL
    GROUP BY external_id
    HAVING count > 1
  `);
  
  if (externalIdDuplicates.length > 0) {
    console.log(`Found ${externalIdDuplicates.length} external_ids with duplicates`);
    
    for (const dup of externalIdDuplicates) {
      const [rows] = await db.query(`
        SELECT id, site_id, advisory_type FROM advisories
        WHERE external_id = ?
        ORDER BY id DESC
      `, [dup.external_id]);
      
      // Keep the first one (highest ID = most recent), delete the rest
      const idsToDelete = rows.slice(1).map(r => r.id);
      
      if (idsToDelete.length > 0) {
        await db.query(`DELETE FROM advisories WHERE id IN (?)`, [idsToDelete]);
        totalRemoved += idsToDelete.length;
        console.log(`  Removed ${idsToDelete.length} duplicate(s) for external_id "${dup.external_id}"`);
      }
    }
  }
  
  // STEP 2: Find duplicates without external_id (fallback logic)
  console.log('Finding duplicates by site+type+times...');
  const [timeDuplicates] = await db.query(`
    SELECT site_id, advisory_type, start_time, end_time, COUNT(*) as count
    FROM advisories
    WHERE external_id IS NULL
    GROUP BY site_id, advisory_type, start_time, end_time
    HAVING count > 1
  `);
  
  if (timeDuplicates.length > 0) {
    console.log(`Found ${timeDuplicates.length} sets of duplicates without external_id`);
    
    for (const dup of timeDuplicates) {
      const [rows] = await db.query(`
        SELECT id FROM advisories
        WHERE site_id = ? 
          AND advisory_type = ? 
          AND start_time <=> ?
          AND end_time <=> ?
          AND external_id IS NULL
        ORDER BY id DESC
      `, [dup.site_id, dup.advisory_type, dup.start_time, dup.end_time]);
      
      const idsToDelete = rows.slice(1).map(r => r.id);
      
      if (idsToDelete.length > 0) {
        await db.query(`DELETE FROM advisories WHERE id IN (?)`, [idsToDelete]);
        totalRemoved += idsToDelete.length;
        console.log(`  Removed ${idsToDelete.length} duplicate(s) for "${dup.advisory_type}" at site ${dup.site_id}`);
      }
    }
  }
  
  if (totalRemoved === 0) {
    console.log('✓ No duplicate advisories found');
  } else {
    console.log(`✓ Total duplicates removed: ${totalRemoved}`);
  }
  
  console.log('');
  return totalRemoved;
}

/**
 * Remove expired advisories
 * Deletes advisories where:
 * - status is 'expired' AND last_updated > 6 hours ago (gives users time to see them)
 * - OR end_time is more than 24 hours in the past
 */
async function removeExpiredAdvisories() {
  const db = getDatabase();
  
  console.log('=== Removing Expired Advisories ===');
  
  // Get count before deletion
  const [beforeCount] = await db.query(`
    SELECT COUNT(*) as count FROM advisories 
    WHERE (status = 'expired' AND last_updated < DATE_SUB(NOW(), INTERVAL 6 HOUR))
       OR (end_time IS NOT NULL AND end_time < DATE_SUB(NOW(), INTERVAL 24 HOUR))
  `);
  
  const expiredCount = beforeCount[0].count;
  
  if (expiredCount === 0) {
    console.log('✓ No old expired advisories to remove\n');
    return 0;
  }
  
  // Delete old expired advisories
  await db.query(`
    DELETE FROM advisories 
    WHERE (status = 'expired' AND last_updated < DATE_SUB(NOW(), INTERVAL 6 HOUR))
       OR (end_time IS NOT NULL AND end_time < DATE_SUB(NOW(), INTERVAL 24 HOUR))
  `);
  
  console.log(`✓ Removed ${expiredCount} old expired advisories\n`);
  return expiredCount;
}

/**
 * Add external_id column if it doesn't exist
 * This will store the NOAA alert ID to prevent duplicates in the future
 */
async function addExternalIdColumn() {
  const db = getDatabase();
  
  console.log('=== Checking Database Schema ===');
  
  // Check if external_id column exists
  const [columns] = await db.query(`
    SELECT COLUMN_NAME 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'advisories' 
      AND COLUMN_NAME = 'external_id'
  `);
  
  if (columns.length > 0) {
    console.log('✓ external_id column already exists\n');
    return false;
  }
  
  console.log('Adding external_id column to advisories table...');
  
  // Add the column
  await db.query(`
    ALTER TABLE advisories 
    ADD COLUMN external_id VARCHAR(255) AFTER id
  `);
  
  // Add unique index
  await db.query(`
    ALTER TABLE advisories 
    ADD UNIQUE INDEX idx_advisories_external_id (external_id)
  `);
  
  console.log('✓ Added external_id column with unique index\n');
  return true;
}

/**
 * Extract and populate external_id from raw_payload
 * For existing advisories without external_id
 */
async function populateExternalIds() {
  const db = getDatabase();
  
  console.log('=== Populating External IDs ===');
  
  // Get advisories without external_id
  const [advisories] = await db.query(`
    SELECT id, raw_payload 
    FROM advisories 
    WHERE external_id IS NULL AND raw_payload IS NOT NULL
    LIMIT 1000
  `);
  
  if (advisories.length === 0) {
    console.log('✓ All advisories have external_id\n');
    return 0;
  }
  
  console.log(`Processing ${advisories.length} advisories...`);
  
  let updated = 0;
  
  for (const advisory of advisories) {
    try {
      const payload = JSON.parse(advisory.raw_payload);
      const externalId = payload.id || payload.properties?.id;
      
      if (externalId) {
        // Check if external_id already exists
        const [existing] = await db.query(
          `SELECT id FROM advisories WHERE external_id = ? AND id != ?`, 
          [externalId, advisory.id]
        );
        
        if (existing.length > 0) {
          // Duplicate found - delete this advisory, keep the existing one
          await db.query(`DELETE FROM advisories WHERE id = ?`, [advisory.id]);
          console.log(`  Removed duplicate advisory ${advisory.id} (external_id exists)`);
        } else {
          // No duplicate - update with external_id
          await db.query(`UPDATE advisories SET external_id = ? WHERE id = ?`, [externalId, advisory.id]);
          updated++;
        }
      }
    } catch (error) {
      // If it's a duplicate key error, delete this advisory
      if (error.code === 'ER_DUP_ENTRY') {
        await db.query(`DELETE FROM advisories WHERE id = ?`, [advisory.id]);
        console.log(`  Removed duplicate advisory ${advisory.id}`);
      } else {
        console.error(`  Error processing advisory ${advisory.id}:`, error.message);
      }
    }
  }
  
  console.log(`✓ Populated ${updated} external IDs\n`);
  return updated;
}

/**
 * Remove duplicate advisory types per site
 * Keeps only the most severe (or most recent) of each advisory type per site
 */
async function removeDuplicateTypes() {
  const db = getDatabase();
  
  console.log('=== Removing Duplicate Advisory Types ===');
  
  const severityOrder = { 'Extreme': 4, 'Severe': 3, 'Moderate': 2, 'Minor': 1, 'Unknown': 0 };
  let totalRemoved = 0;
  
  // Find sites with multiple advisories of the same type
  const [duplicateTypes] = await db.query(`
    SELECT site_id, advisory_type, COUNT(*) as count
    FROM advisories
    WHERE status = 'active'
    GROUP BY site_id, advisory_type
    HAVING count > 1
  `);
  
  if (duplicateTypes.length === 0) {
    console.log('✓ No duplicate advisory types found\n');
    return 0;
  }
  
  console.log(`Found ${duplicateTypes.length} advisory types with duplicates`);
  
  for (const dup of duplicateTypes) {
    // Get all advisories of this type for this site
    const [advisories] = await db.query(`
      SELECT id, severity, issued_time, last_updated
      FROM advisories
      WHERE site_id = ? AND advisory_type = ? AND status = 'active'
      ORDER BY 
        CASE severity
          WHEN 'Extreme' THEN 4
          WHEN 'Severe' THEN 3
          WHEN 'Moderate' THEN 2
          WHEN 'Minor' THEN 1
          ELSE 0
        END DESC,
        issued_time DESC,
        last_updated DESC
    `, [dup.site_id, dup.advisory_type]);
    
    if (advisories.length > 1) {
      // Keep the first (most severe/recent), delete the rest
      const idsToDelete = advisories.slice(1).map(a => a.id);
      
      if (idsToDelete.length > 0) {
        await db.query(`DELETE FROM advisories WHERE id IN (?)`, [idsToDelete]);
        totalRemoved += idsToDelete.length;
        console.log(`  Removed ${idsToDelete.length} duplicate "${dup.advisory_type}" for site ${dup.site_id}`);
      }
    }
  }
  
  console.log(`✓ Total duplicate types removed: ${totalRemoved}\n`);
  return totalRemoved;
}

/**
 * Main cleanup function
 */
async function runCleanup() {
  try {
    await initDatabase();
    
    console.log('\n╔══════════════════════════════════════════════════════╗');
    console.log('║  Storm Scout - Advisory Cleanup                     ║');
    console.log('╠══════════════════════════════════════════════════════╣');
    console.log(`║  Started: ${new Date().toISOString().padEnd(38)} ║`);
    console.log('╚══════════════════════════════════════════════════════╝\n');
    
    // Step 1: Add external_id column if needed
    await addExternalIdColumn();
    
    // Step 2: Populate external_id from existing raw_payload
    await populateExternalIds();
    
    // Step 3: Remove duplicate advisory types (same type, different zones)
    const duplicateTypesRemoved = await removeDuplicateTypes();
    
    // Step 4: Remove duplicates by external_id
    const duplicatesRemoved = await removeDuplicateAdvisories();
    
    // Step 5: Remove expired
    const expiredRemoved = await removeExpiredAdvisories();
    
    // Summary
    const totalRemoved = duplicateTypesRemoved + duplicatesRemoved + expiredRemoved;
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║  Cleanup Complete                                    ║');
    console.log('╠══════════════════════════════════════════════════════╣');
    console.log(`║  Duplicate types:    ${duplicateTypesRemoved.toString().padStart(28)} ║`);
    console.log(`║  Duplicate IDs:      ${duplicatesRemoved.toString().padStart(28)} ║`);
    console.log(`║  Expired removed:    ${expiredRemoved.toString().padStart(28)} ║`);
    console.log(`║  Total removed:      ${totalRemoved.toString().padStart(28)} ║`);
    console.log('╚══════════════════════════════════════════════════════╝\n');
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n✗ Cleanup failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runCleanup();
}

module.exports = {
  removeDuplicateAdvisories,
  removeDuplicateTypes,
  removeExpiredAdvisories,
  addExternalIdColumn,
  populateExternalIds,
  runCleanup
};
