#!/usr/bin/env node
/**
 * Scheduled VTEC Duplicate Cleanup
 * Runs daily to remove any VTEC-based duplicates that may have accumulated
 * Designed to be run via cron (e.g., daily at 3 AM)
 */

require('dotenv').config();
const { initDatabase, getDatabase } = require('../config/database');

async function scheduledCleanup() {
  const timestamp = new Date().toISOString();
  console.log(`\n═══ Scheduled VTEC Cleanup Started ═══`);
  console.log(`Time: ${timestamp}\n`);
  
  try {
    await initDatabase();
    const db = await getDatabase();
    
    // Find VTEC-based duplicates: same VTEC code, site, and type
    const [duplicateGroups] = await db.query(`
      SELECT vtec_code, site_id, advisory_type, COUNT(*) as count
      FROM advisories
      WHERE vtec_code IS NOT NULL
      AND status = 'active'
      GROUP BY vtec_code, site_id, advisory_type
      HAVING COUNT(*) > 1
      ORDER BY count DESC
    `);
    
    if (duplicateGroups.length === 0) {
      console.log('✓ No VTEC duplicates found');
      console.log('═══ Cleanup Complete ═══\n');
      return;
    }
    
    console.log(`Found ${duplicateGroups.length} groups of VTEC duplicates`);
    
    let totalDeleted = 0;
    
    for (const group of duplicateGroups) {
      const { vtec_code, site_id, advisory_type, count } = group;
      
      // Get all alerts in this group, ordered by most recent first
      const [alerts] = await db.query(`
        SELECT id, external_id, last_updated, headline
        FROM advisories
        WHERE vtec_code = ? AND site_id = ? AND advisory_type = ? AND status = 'active'
        ORDER BY last_updated DESC, id DESC
      `, [vtec_code, site_id, advisory_type]);
      
      // Keep the first (most recent), delete the rest
      const toKeep = alerts[0];
      const toDelete = alerts.slice(1);
      
      console.log(`\nVTEC: ${vtec_code}`);
      console.log(`  Site: ${site_id}, Type: ${advisory_type}`);
      console.log(`  Keeping: ID ${toKeep.id} (updated ${toKeep.last_updated})`);
      console.log(`  Deleting: ${toDelete.length} duplicate(s)`);
      
      for (const alert of toDelete) {
        await db.query('DELETE FROM advisories WHERE id = ?', [alert.id]);
        totalDeleted++;
        console.log(`    - Deleted ID ${alert.id}`);
      }
    }
    
    console.log(`\n═══ Cleanup Complete ═══`);
    console.log(`Total duplicates removed: ${totalDeleted}`);
    console.log(`Groups processed: ${duplicateGroups.length}\n`);
    
    // Log to a file for monitoring
    const logEntry = {
      timestamp,
      duplicateGroups: duplicateGroups.length,
      totalDeleted,
      details: duplicateGroups.map(g => ({
        vtec: g.vtec_code,
        site: g.site_id,
        type: g.advisory_type,
        count: g.count
      }))
    };
    
    const fs = require('fs');
    const path = require('path');
    const logFile = path.join(__dirname, '../../.cleanup-log.json');
    
    // Append to log file
    let logs = [];
    if (fs.existsSync(logFile)) {
      try {
        logs = JSON.parse(fs.readFileSync(logFile, 'utf8'));
      } catch (e) {
        logs = [];
      }
    }
    
    logs.push(logEntry);
    
    // Keep only last 30 days of logs
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    logs = logs.filter(log => new Date(log.timestamp) > thirtyDaysAgo);
    
    fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));
    
  } catch (error) {
    console.error('\n✗ Scheduled cleanup failed:', error);
    process.exit(1);
  }
}

scheduledCleanup();
