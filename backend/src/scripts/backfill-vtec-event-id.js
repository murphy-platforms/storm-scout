#!/usr/bin/env node
/**
 * Backfill VTEC Event IDs and Actions
 * Extracts event IDs and action codes from existing vtec_code values
 */

require('dotenv').config();
const { initDatabase, getDatabase } = require('../config/database');
const { extractVTECEventID, extractVTECAction } = require('../ingestion/utils/normalizer');

async function backfillVTECEventData() {
  console.log('\n═══ VTEC Event ID and Action Backfill Started ═══');
  console.log(`Time: ${new Date().toISOString()}\n`);
  
  try {
    await initDatabase();
    const db = await getDatabase();
    
    // Get all alerts with VTEC codes but no event ID
    const [alerts] = await db.query(`
      SELECT id, vtec_code 
      FROM advisories 
      WHERE vtec_code IS NOT NULL
      AND (vtec_event_id IS NULL OR vtec_action IS NULL)
    `);
    
    console.log(`Found ${alerts.length} alerts to process\n`);
    
    if (alerts.length === 0) {
      console.log('✓ All alerts already have event IDs and actions');
      console.log('═══ Backfill Complete ═══\n');
      return;
    }
    
    let updated = 0;
    let failed = 0;
    
    for (const alert of alerts) {
      try {
        const eventId = extractVTECEventID(alert.vtec_code);
        const action = extractVTECAction(alert.vtec_code);
        
        if (eventId && action) {
          await db.query(
            'UPDATE advisories SET vtec_event_id = ?, vtec_action = ? WHERE id = ?',
            [eventId, action, alert.id]
          );
          updated++;
          
          if (updated % 100 === 0) {
            console.log(`Progress: ${updated}/${alerts.length} alerts updated`);
          }
        } else {
          console.warn(`  Warning: Could not extract event ID/action from: ${alert.vtec_code}`);
          failed++;
        }
      } catch (error) {
        failed++;
        console.error(`Failed to process alert ${alert.id}:`, error.message);
      }
    }
    
    // Get statistics on action codes
    const [actionStats] = await db.query(`
      SELECT vtec_action, COUNT(*) as count
      FROM advisories
      WHERE vtec_action IS NOT NULL
      GROUP BY vtec_action
      ORDER BY count DESC
    `);
    
    console.log('\n═══ Backfill Complete ═══');
    console.log(`Updated: ${updated} alerts`);
    console.log(`Failed: ${failed} alerts`);
    console.log(`\nAction Code Distribution:`);
    actionStats.forEach(stat => {
      console.log(`  ${stat.vtec_action}: ${stat.count} alerts`);
    });
    console.log('');
    
  } catch (error) {
    console.error('\n✗ Backfill failed:', error);
    process.exit(1);
  }
}

backfillVTECEventData();
