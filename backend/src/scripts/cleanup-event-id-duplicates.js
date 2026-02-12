#!/usr/bin/env node
/**
 * Clean up duplicates based on VTEC Event IDs
 * Keeps the most recent/appropriate version of each event
 * Prioritizes: CON/EXT > NEW (continuations over initial alerts)
 */

require('dotenv').config();
const { initDatabase, getDatabase } = require('../config/database');

async function cleanupEventIDDuplicates() {
  const timestamp = new Date().toISOString();
  console.log(`\n═══ VTEC Event ID Duplicate Cleanup Started ═══`);
  console.log(`Time: ${timestamp}\n`);
  
  try {
    await initDatabase();
    const db = await getDatabase();
    
    // Find duplicates: same event ID, site, and type
    const [duplicateGroups] = await db.query(`
      SELECT vtec_event_id, site_id, advisory_type, COUNT(*) as count
      FROM advisories
      WHERE vtec_event_id IS NOT NULL
      AND status = 'active'
      GROUP BY vtec_event_id, site_id, advisory_type
      HAVING COUNT(*) > 1
      ORDER BY count DESC
    `);
    
    if (duplicateGroups.length === 0) {
      console.log('✓ No event ID duplicates found');
      console.log('═══ Cleanup Complete ═══\n');
      return;
    }
    
    console.log(`Found ${duplicateGroups.length} groups of duplicates\n`);
    
    let totalDeleted = 0;
    
    for (const group of duplicateGroups) {
      const { vtec_event_id, site_id, advisory_type, count } = group;
      
      // Get all alerts in this group
      // Order by:
      // 1. Priority of action (CON/EXT before NEW, EXP/CAN last)
      // 2. Most recent last_updated
      // 3. Highest ID (newest insert)
      const [alerts] = await db.query(`
        SELECT id, vtec_action, external_id, last_updated, headline
        FROM advisories
        WHERE vtec_event_id = ? AND site_id = ? AND advisory_type = ? AND status = 'active'
        ORDER BY 
          CASE vtec_action
            WHEN 'CON' THEN 1
            WHEN 'EXT' THEN 2
            WHEN 'EXA' THEN 3
            WHEN 'EXB' THEN 4
            WHEN 'UPG' THEN 5
            WHEN 'COR' THEN 6
            WHEN 'NEW' THEN 7
            WHEN 'EXP' THEN 8
            WHEN 'CAN' THEN 9
            ELSE 10
          END,
          last_updated DESC,
          id DESC
      `, [vtec_event_id, site_id, advisory_type]);
      
      // Keep the first (highest priority/most recent), delete the rest
      const toKeep = alerts[0];
      const toDelete = alerts.slice(1);
      
      console.log(`\nEvent ID: ${vtec_event_id}`);
      console.log(`  Site: ${site_id}, Type: ${advisory_type}`);
      console.log(`  Keeping: ID ${toKeep.id} [${toKeep.vtec_action}] (updated ${toKeep.last_updated})`);
      console.log(`  Deleting: ${toDelete.length} duplicate(s)`);
      
      for (const alert of toDelete) {
        await db.query('DELETE FROM advisories WHERE id = ?', [alert.id]);
        totalDeleted++;
        console.log(`    - Deleted ID ${alert.id} [${alert.vtec_action}]`);
      }
    }
    
    console.log(`\n═══ Cleanup Complete ═══`);
    console.log(`Total duplicates removed: ${totalDeleted}`);
    console.log(`Groups processed: ${duplicateGroups.length}\n`);
    
  } catch (error) {
    console.error('\n✗ Cleanup failed:', error);
    process.exit(1);
  }
}

cleanupEventIDDuplicates();
