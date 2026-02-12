#!/usr/bin/env node
/**
 * Clean up duplicate alerts based on VTEC codes
 * Keeps the most recently updated alert for each VTEC/site/type combination
 */

require('dotenv').config();
const { initDatabase, getDatabase } = require('../config/database');

async function cleanupDuplicates() {
  console.log('Starting duplicate cleanup process...');
  
  try {
    await initDatabase();
    const db = await getDatabase();
    
    // Find duplicates: alerts with same VTEC, site_id, and advisory_type
    const [duplicateGroups] = await db.query(`
      SELECT vtec_code, site_id, advisory_type, COUNT(*) as count
      FROM advisories
      WHERE vtec_code IS NOT NULL
      AND status = 'active'
      GROUP BY vtec_code, site_id, advisory_type
      HAVING COUNT(*) > 1
      ORDER BY count DESC
    `);
    
    console.log(`Found ${duplicateGroups.length} groups of duplicates`);
    
    let totalDeleted = 0;
    
    for (const group of duplicateGroups) {
      const { vtec_code, site_id, advisory_type, count } = group;
      
      // Get all alerts in this group, ordered by most recent first
      const [alerts] = await db.query(`
        SELECT id, external_id, last_updated
        FROM advisories
        WHERE vtec_code = ? AND site_id = ? AND advisory_type = ?
        ORDER BY last_updated DESC
      `, [vtec_code, site_id, advisory_type]);
      
      // Keep the first (most recent), delete the rest
      const toKeep = alerts[0];
      const toDelete = alerts.slice(1);
      
      console.log(`VTEC ${vtec_code} at site ${site_id}: keeping ID ${toKeep.id}, deleting ${toDelete.length} duplicates`);
      
      for (const alert of toDelete) {
        await db.query('DELETE FROM advisories WHERE id = ?', [alert.id]);
        totalDeleted++;
      }
    }
    
    console.log('\nCleanup complete:');
    console.log(`- Duplicate groups processed: ${duplicateGroups.length}`);
    console.log(`- Total alerts deleted: ${totalDeleted}`);
    
    // Verify remaining active alerts
    const [countResult] = await db.query(`
      SELECT COUNT(*) as total FROM advisories WHERE status = 'active'
    `);
    console.log(`- Active alerts remaining: ${countResult[0].total}`);
    
  } catch (error) {
    console.error('Cleanup failed:', error);
    process.exit(1);
  }
}

cleanupDuplicates();
