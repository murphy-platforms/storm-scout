/**
 * Unified Advisory Cleanup Module
 * Consolidates all cleanup functionality with batching and race condition handling
 * 
 * Modes:
 *   - full: Run all cleanup steps (external_id, VTEC, duplicates, expired)
 *   - vtec: Clean VTEC-based duplicates only
 *   - event_id: Clean event ID-based duplicates only
 *   - expired: Remove expired advisories only
 *   - duplicates: Remove all types of duplicates
 */

const { initDatabase, getDatabase, closeDatabase } = require('../config/database');
const { alertCleanupFailure } = require('./alerting');

// Batch size for bulk operations to avoid memory/performance issues
const BATCH_SIZE = 1000;

/**
 * Delete records in batches to avoid large IN clauses
 * @param {Array} ids - IDs to delete
 * @param {string} table - Table name
 * @returns {Promise<number>} Total deleted
 */
async function batchDelete(ids, table = 'advisories') {
  if (ids.length === 0) return 0;
  
  const db = getDatabase();
  let totalDeleted = 0;
  
  // Process in batches
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const [result] = await db.query(`DELETE FROM ${table} WHERE id IN (?)`, [batch]);
    totalDeleted += result.affectedRows;
  }
  
  return totalDeleted;
}

/**
 * Remove duplicate advisories by external_id
 * Uses INSERT ... ON DUPLICATE KEY UPDATE pattern to avoid race conditions
 */
async function removeDuplicatesByExternalId() {
  const db = getDatabase();
  
  console.log('\n=== Removing Duplicates by External ID ===');
  
  // Find duplicates by external_id + site_id (same alert for same site)
  const [duplicates] = await db.query(`
    SELECT external_id, office_id, GROUP_CONCAT(id ORDER BY id DESC) as ids, COUNT(*) as count
    FROM advisories
    WHERE external_id IS NOT NULL
    GROUP BY external_id, office_id
    HAVING count > 1
  `);
  
  if (duplicates.length === 0) {
    console.log('✓ No external_id duplicates found');
    return 0;
  }
  
  console.log(`Found ${duplicates.length} external_ids with duplicates`);
  
  // Collect IDs to delete (all but the highest/newest ID for each external_id)
  const idsToDelete = [];
  for (const dup of duplicates) {
    const ids = dup.ids.split(',').map(Number);
    // Keep the first (highest ID), delete the rest
    idsToDelete.push(...ids.slice(1));
  }
  
  const deleted = await batchDelete(idsToDelete);
  console.log(`✓ Removed ${deleted} external_id duplicates`);
  return deleted;
}

/**
 * Remove duplicates by VTEC event ID
 * Prioritizes continuation (CON/EXT) over new (NEW) alerts
 */
async function removeDuplicatesByVTECEventId() {
  const db = getDatabase();
  
  console.log('\n=== Removing Duplicates by VTEC Event ID ===');
  
  // Find duplicates: same event ID, site, and type
  const [duplicateGroups] = await db.query(`
    SELECT vtec_event_id, office_id, advisory_type, 
           GROUP_CONCAT(
             id ORDER BY 
               CASE vtec_action
                 WHEN 'CON' THEN 1 WHEN 'EXT' THEN 2 WHEN 'EXA' THEN 3
                 WHEN 'EXB' THEN 4 WHEN 'UPG' THEN 5 WHEN 'COR' THEN 6
                 WHEN 'NEW' THEN 7 WHEN 'EXP' THEN 8 WHEN 'CAN' THEN 9
                 ELSE 10
               END,
               last_updated DESC,
               id DESC
           ) as ids,
           COUNT(*) as count
    FROM advisories
    WHERE vtec_event_id IS NOT NULL AND status = 'active'
    GROUP BY vtec_event_id, office_id, advisory_type
    HAVING count > 1
  `);
  
  if (duplicateGroups.length === 0) {
    console.log('✓ No VTEC event ID duplicates found');
    return 0;
  }
  
  console.log(`Found ${duplicateGroups.length} VTEC event groups with duplicates`);
  
  const idsToDelete = [];
  for (const group of duplicateGroups) {
    const ids = group.ids.split(',').map(Number);
    // Keep the first (highest priority/most recent), delete the rest
    idsToDelete.push(...ids.slice(1));
  }
  
  const deleted = await batchDelete(idsToDelete);
  console.log(`✓ Removed ${deleted} VTEC event ID duplicates`);
  return deleted;
}

/**
 * Remove duplicates by VTEC code (legacy)
 */
async function removeDuplicatesByVTECCode() {
  const db = getDatabase();
  
  console.log('\n=== Removing Duplicates by VTEC Code ===');
  
  const [duplicateGroups] = await db.query(`
    SELECT vtec_code, office_id, advisory_type,
           GROUP_CONCAT(id ORDER BY last_updated DESC, id DESC) as ids,
           COUNT(*) as count
    FROM advisories
    WHERE vtec_code IS NOT NULL AND status = 'active'
    GROUP BY vtec_code, office_id, advisory_type
    HAVING count > 1
  `);
  
  if (duplicateGroups.length === 0) {
    console.log('✓ No VTEC code duplicates found');
    return 0;
  }
  
  console.log(`Found ${duplicateGroups.length} VTEC code groups with duplicates`);
  
  const idsToDelete = [];
  for (const group of duplicateGroups) {
    const ids = group.ids.split(',').map(Number);
    idsToDelete.push(...ids.slice(1));
  }
  
  const deleted = await batchDelete(idsToDelete);
  console.log(`✓ Removed ${deleted} VTEC code duplicates`);
  return deleted;
}

/**
 * Remove duplicate advisory types per site
 * Keeps only the most severe of each advisory type per site
 */
async function removeDuplicateTypes() {
  const db = getDatabase();
  
  console.log('\n=== Removing Duplicate Advisory Types ===');
  
  const [duplicateTypes] = await db.query(`
    SELECT office_id, advisory_type,
           GROUP_CONCAT(
             id ORDER BY 
               CASE severity
                 WHEN 'Extreme' THEN 4 WHEN 'Severe' THEN 3
                 WHEN 'Moderate' THEN 2 WHEN 'Minor' THEN 1
                 ELSE 0
               END DESC,
               issued_time DESC,
               last_updated DESC
           ) as ids,
           COUNT(*) as count
    FROM advisories
    WHERE status = 'active'
    GROUP BY office_id, advisory_type
    HAVING count > 1
  `);
  
  if (duplicateTypes.length === 0) {
    console.log('✓ No duplicate advisory types found');
    return 0;
  }
  
  console.log(`Found ${duplicateTypes.length} advisory types with duplicates`);
  
  const idsToDelete = [];
  for (const dup of duplicateTypes) {
    const ids = dup.ids.split(',').map(Number);
    idsToDelete.push(...ids.slice(1));
  }
  
  const deleted = await batchDelete(idsToDelete);
  console.log(`✓ Removed ${deleted} duplicate types`);
  return deleted;
}

/**
 * Mark alerts as expired when their end_time has passed
 * This should run before removing expired advisories
 */
async function markExpiredByEndTime() {
  const db = getDatabase();
  
  console.log('\n=== Marking Expired Advisories (by end_time) ===');
  
  // Mark as expired: active alerts where end_time has passed
  const [result] = await db.query(`
    UPDATE advisories
    SET status = 'expired', last_updated = NOW()
    WHERE status = 'active' 
      AND end_time IS NOT NULL 
      AND end_time < NOW()
  `);
  
  const marked = result.affectedRows;
  if (marked > 0) {
    console.log(`✓ Marked ${marked} advisories as expired (end_time passed)`);
  } else {
    console.log('✓ No advisories to mark as expired');
  }
  
  return marked;
}

/**
 * Remove expired advisories (batched)
 */
async function removeExpiredAdvisories() {
  const db = getDatabase();
  
  console.log('\n=== Removing Expired Advisories ===');
  
  // First, mark any alerts that should be expired
  await markExpiredByEndTime();
  
  // Get IDs of expired advisories to delete
  // Delete if: expired for 6+ hours, OR end_time was 24+ hours ago
  const [expiredRows] = await db.query(`
    SELECT id FROM advisories 
    WHERE (status = 'expired' AND last_updated < DATE_SUB(NOW(), INTERVAL 6 HOUR))
       OR (end_time IS NOT NULL AND end_time < DATE_SUB(NOW(), INTERVAL 24 HOUR))
    LIMIT 10000
  `);
  
  if (expiredRows.length === 0) {
    console.log('✓ No old expired advisories to remove');
    return 0;
  }
  
  const ids = expiredRows.map(r => r.id);
  const deleted = await batchDelete(ids);
  console.log(`✓ Removed ${deleted} old expired advisories`);
  return deleted;
}

/**
 * Populate external_id from raw_payload using atomic upsert
 * Avoids race conditions with INSERT ... ON DUPLICATE KEY UPDATE
 */
async function populateExternalIds() {
  const db = getDatabase();
  
  console.log('\n=== Populating External IDs ===');
  
  const [advisories] = await db.query(`
    SELECT id, raw_payload 
    FROM advisories 
    WHERE external_id IS NULL AND raw_payload IS NOT NULL
    LIMIT ${BATCH_SIZE}
  `);
  
  if (advisories.length === 0) {
    console.log('✓ All advisories have external_id');
    return 0;
  }
  
  console.log(`Processing ${advisories.length} advisories...`);
  
  let updated = 0;
  let duplicatesRemoved = 0;
  
  for (const advisory of advisories) {
    try {
      const payload = JSON.parse(advisory.raw_payload);
      const externalId = payload.id || payload.properties?.id;
      
      if (externalId) {
        // Use a transaction to atomically check and update/delete
        const connection = await db.getConnection();
        try {
          await connection.beginTransaction();
          
          // Lock the row with FOR UPDATE to prevent race conditions
          // Check for same external_id AND office_id (multi-site alerts are valid)
          const [sameRow] = await connection.query(
            `SELECT id FROM advisories WHERE external_id = ? AND office_id = (SELECT office_id FROM advisories WHERE id = ?) FOR UPDATE`, 
            [externalId, advisory.id]
          );
          
          if (sameRow.length > 0) {
            // Duplicate for same site - delete this one
            await connection.query(`DELETE FROM advisories WHERE id = ?`, [advisory.id]);
            duplicatesRemoved++;
          } else {
            // Update with external_id
            await connection.query(
              `UPDATE advisories SET external_id = ? WHERE id = ?`, 
              [externalId, advisory.id]
            );
            updated++;
          }
          
          await connection.commit();
        } catch (error) {
          await connection.rollback();
          if (error.code === 'ER_DUP_ENTRY') {
            // Race condition - another process set this external_id
            await db.query(`DELETE FROM advisories WHERE id = ?`, [advisory.id]);
            duplicatesRemoved++;
          } else {
            throw error;
          }
        } finally {
          connection.release();
        }
      }
    } catch (error) {
      console.error(`  Error processing advisory ${advisory.id}:`, error.message);
    }
  }
  
  console.log(`✓ Populated ${updated} external IDs, removed ${duplicatesRemoved} duplicates`);
  return updated + duplicatesRemoved;
}

/**
 * Check database schema for required columns
 */
async function checkSchema() {
  const db = getDatabase();
  
  console.log('\n=== Checking Database Schema ===');
  
  const requiredColumns = [
    { name: 'external_id', type: 'VARCHAR(255)', after: 'id' },
    { name: 'vtec_code', type: 'VARCHAR(255)', after: 'issued_time' },
    { name: 'vtec_event_id', type: 'VARCHAR(50)', after: 'vtec_code' },
    { name: 'vtec_action', type: 'VARCHAR(10)', after: 'vtec_event_id' }
  ];
  
  const [columns] = await db.query(`
    SELECT COLUMN_NAME 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'advisories'
  `);
  
  const existingColumns = new Set(columns.map(c => c.COLUMN_NAME));
  const missingColumns = requiredColumns.filter(c => !existingColumns.has(c.name));
  
  if (missingColumns.length === 0) {
    console.log('✓ All required columns exist');
    return true;
  }
  
  console.warn(`Missing columns: ${missingColumns.map(c => c.name).join(', ')}`);
  console.warn('Run database migrations to add missing columns.');
  return false;
}

/**
 * Run cleanup with specified mode
 * @param {string} mode - Cleanup mode: full, vtec, event_id, expired, duplicates
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Cleanup results
 */
async function runCleanup(mode = 'full', options = {}) {
  const { silent = false, exitOnComplete = true } = options;
  const log = silent ? () => {} : console.log;
  
  const results = {
    mode,
    startTime: new Date().toISOString(),
    externalIdDuplicates: 0,
    vtecEventIdDuplicates: 0,
    vtecCodeDuplicates: 0,
    typeDuplicates: 0,
    expiredRemoved: 0,
    externalIdsPopulated: 0,
    totalRemoved: 0,
    success: true,
    error: null
  };
  
  try {
    await initDatabase();
    
    log('\n╔══════════════════════════════════════════════════════╗');
    log(`║  Storm Scout - Advisory Cleanup (${mode.padEnd(15)})   ║`);
    log('╠══════════════════════════════════════════════════════╣');
    log(`║  Started: ${results.startTime.padEnd(38)} ║`);
    log('╚══════════════════════════════════════════════════════╝');
    
    // Check schema first
    await checkSchema();
    
    // Run cleanup based on mode
    switch (mode) {
      case 'full':
        results.externalIdsPopulated = await populateExternalIds();
        results.externalIdDuplicates = await removeDuplicatesByExternalId();
        results.vtecEventIdDuplicates = await removeDuplicatesByVTECEventId();
        results.vtecCodeDuplicates = await removeDuplicatesByVTECCode();
        results.typeDuplicates = await removeDuplicateTypes();
        results.expiredRemoved = await removeExpiredAdvisories();
        break;
        
      case 'vtec':
        results.vtecCodeDuplicates = await removeDuplicatesByVTECCode();
        break;
        
      case 'event_id':
        results.vtecEventIdDuplicates = await removeDuplicatesByVTECEventId();
        break;
        
      case 'expired':
        results.expiredRemoved = await removeExpiredAdvisories();
        break;
        
      case 'duplicates':
        results.externalIdDuplicates = await removeDuplicatesByExternalId();
        results.vtecEventIdDuplicates = await removeDuplicatesByVTECEventId();
        results.vtecCodeDuplicates = await removeDuplicatesByVTECCode();
        results.typeDuplicates = await removeDuplicateTypes();
        break;
        
      default:
        throw new Error(`Unknown cleanup mode: ${mode}`);
    }
    
    // Calculate totals
    results.totalRemoved = 
      results.externalIdDuplicates +
      results.vtecEventIdDuplicates +
      results.vtecCodeDuplicates +
      results.typeDuplicates +
      results.expiredRemoved;
    
    results.endTime = new Date().toISOString();
    
    // Print summary
    log('\n╔══════════════════════════════════════════════════════╗');
    log('║  Cleanup Complete                                    ║');
    log('╠══════════════════════════════════════════════════════╣');
    if (results.externalIdsPopulated > 0) {
      log(`║  External IDs populated: ${results.externalIdsPopulated.toString().padStart(23)} ║`);
    }
    if (results.externalIdDuplicates > 0) {
      log(`║  External ID duplicates: ${results.externalIdDuplicates.toString().padStart(23)} ║`);
    }
    if (results.vtecEventIdDuplicates > 0) {
      log(`║  VTEC event duplicates:  ${results.vtecEventIdDuplicates.toString().padStart(23)} ║`);
    }
    if (results.vtecCodeDuplicates > 0) {
      log(`║  VTEC code duplicates:   ${results.vtecCodeDuplicates.toString().padStart(23)} ║`);
    }
    if (results.typeDuplicates > 0) {
      log(`║  Type duplicates:        ${results.typeDuplicates.toString().padStart(23)} ║`);
    }
    if (results.expiredRemoved > 0) {
      log(`║  Expired removed:        ${results.expiredRemoved.toString().padStart(23)} ║`);
    }
    log(`║  Total removed:          ${results.totalRemoved.toString().padStart(23)} ║`);
    log('╚══════════════════════════════════════════════════════╝\n');
    
  } catch (error) {
    results.success = false;
    results.error = error.message;
    console.error('\n✗ Cleanup failed:', error.message);
    
    // Send alert
    await alertCleanupFailure(error);
  } finally {
    if (exitOnComplete) {
      await closeDatabase();
      process.exit(results.success ? 0 : 1);
    }
  }
  
  return results;
}

// CLI entry point
if (require.main === module) {
  const mode = process.argv[2] || 'full';
  runCleanup(mode);
}

module.exports = {
  runCleanup,
  removeExpiredAdvisories,
  markExpiredByEndTime,
  removeDuplicatesByExternalId,
  removeDuplicatesByVTECEventId,
  removeDuplicatesByVTECCode,
  removeDuplicateTypes,
  populateExternalIds,
  checkSchema,
  batchDelete,
  BATCH_SIZE
};
