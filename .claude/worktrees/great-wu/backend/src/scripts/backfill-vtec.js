#!/usr/bin/env node
/**
 * Backfill VTEC codes for existing alerts
 * Extracts VTEC from raw_payload and updates the vtec_code column
 */

require('dotenv').config();
const { initDatabase, getDatabase } = require('../config/database');
const { extractVTEC } = require('../ingestion/utils/normalizer');

async function backfillVTEC() {
  console.log('Starting VTEC backfill process...');
  
  try {
    await initDatabase();
    const db = await getDatabase();
    
    // Get all active alerts without VTEC codes
    const [alerts] = await db.query(`
      SELECT id, raw_payload 
      FROM advisories 
      WHERE vtec_code IS NULL 
      AND raw_payload IS NOT NULL
      AND status = 'active'
    `);
    
    console.log(`Found ${alerts.length} alerts without VTEC codes`);
    
    let updated = 0;
    let failed = 0;
    
    for (const alert of alerts) {
      try {
        // Parse the raw payload
        const payload = JSON.parse(alert.raw_payload);
        
        // Extract VTEC
        const vtecCode = extractVTEC(payload);
        
        if (vtecCode) {
          // Update the record
          await db.query(
            'UPDATE advisories SET vtec_code = ? WHERE id = ?',
            [vtecCode, alert.id]
          );
          updated++;
          
          if (updated % 100 === 0) {
            console.log(`Progress: ${updated}/${alerts.length} alerts updated`);
          }
        }
      } catch (error) {
        failed++;
        console.error(`Failed to process alert ${alert.id}:`, error.message);
      }
    }
    
    console.log('\nBackfill complete:');
    console.log(`- Updated: ${updated} alerts`);
    console.log(`- Failed: ${failed} alerts`);
    console.log(`- No VTEC: ${alerts.length - updated - failed} alerts`);
  } catch (error) {
    console.error('Backfill failed:', error);
    process.exit(1);
  }
}

backfillVTEC();
