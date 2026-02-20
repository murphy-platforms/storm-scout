/**
 * Sync ProInsights Reference Data with Sites Table
 * 
 * Usage:
 *   node src/scripts/sync-reference.js --dry-run   # Report only, no writes
 *   node src/scripts/sync-reference.js              # Apply updates
 * 
 * This script:
 * 1. Compares site_reference (keyed by parent_site_code) with sites (keyed by site_code)
 * 2. Reports city and state mismatches (reference is source of truth)
 * 3. Updates the 6 ProInsights display columns on the sites table
 * 4. Flags unmatched codes in both directions
 */

const { initDatabase, getDatabase, closeDatabase } = require('../config/database');

const dryRun = process.argv.includes('--dry-run');

async function syncReference() {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ProInsights Reference Sync ${dryRun ? '(DRY RUN - no writes)' : '(LIVE - will apply updates)'}`);
  console.log(`${'='.repeat(70)}\n`);

  await initDatabase();
  const db = getDatabase();

  // Check site_reference has data
  const [refCount] = await db.query('SELECT COUNT(*) as cnt FROM site_reference');
  if (refCount[0].cnt === 0) {
    console.error('✗ site_reference table is empty. Run import-reference.js first.');
    process.exit(1);
  }
  console.log(`  Reference rows: ${refCount[0].cnt}`);

  const [siteCount] = await db.query('SELECT COUNT(*) as cnt FROM sites');
  console.log(`  Project sites:  ${siteCount[0].cnt}\n`);

  // =========================================================================
  // 1. State mismatches
  // =========================================================================
  const [stateMismatches] = await db.query(`
    SELECT s.site_code, s.name, s.city AS project_city, s.state AS project_state,
           r.city AS ref_city, r.state AS ref_state
    FROM sites s
    JOIN site_reference r ON s.site_code = r.parent_site_code
    WHERE UPPER(s.state) != UPPER(r.state)
    ORDER BY s.site_code
  `);

  console.log(`${'─'.repeat(70)}`);
  console.log('STATE MISMATCHES (project state != reference state)');
  console.log(`${'─'.repeat(70)}`);
  if (stateMismatches.length > 0) {
    for (const m of stateMismatches) {
      console.log(`  ${m.site_code}: Project=${m.project_state}  Reference=${m.ref_state}  (${m.name})`);
    }
  } else {
    console.log('  None ✓');
  }

  // =========================================================================
  // 2. City mismatches
  // =========================================================================
  const [cityMismatches] = await db.query(`
    SELECT s.site_code, s.name, s.city AS project_city, s.state AS project_state,
           r.city AS ref_city, r.state AS ref_state
    FROM sites s
    JOIN site_reference r ON s.site_code = r.parent_site_code
    WHERE UPPER(s.city) != UPPER(r.city)
    ORDER BY s.site_code
  `);

  console.log(`\n${'─'.repeat(70)}`);
  console.log('CITY MISMATCHES (project city != reference city)');
  console.log(`${'─'.repeat(70)}`);
  if (cityMismatches.length > 0) {
    for (const m of cityMismatches) {
      console.log(`  ${m.site_code}: Project=${m.project_city.padEnd(25)} Reference=${m.ref_city}`);
    }
  } else {
    console.log('  None ✓');
  }

  // =========================================================================
  // 3. Unmatched codes
  // =========================================================================
  const [unmatchedProject] = await db.query(`
    SELECT s.site_code, s.name, s.city, s.state
    FROM sites s
    LEFT JOIN site_reference r ON s.site_code = r.parent_site_code
    WHERE r.parent_site_code IS NULL
    ORDER BY s.site_code
  `);

  console.log(`\n${'─'.repeat(70)}`);
  console.log('PROJECT site_codes WITH NO REFERENCE MATCH');
  console.log(`${'─'.repeat(70)}`);
  if (unmatchedProject.length > 0) {
    for (const s of unmatchedProject) {
      console.log(`  ${s.site_code}: ${s.name} (${s.city}, ${s.state})`);
    }
  } else {
    console.log('  None ✓');
  }

  const [unmatchedRef] = await db.query(`
    SELECT r.parent_site_code, r.site_name, r.city, r.state
    FROM site_reference r
    LEFT JOIN sites s ON r.parent_site_code = s.site_code
    WHERE s.site_code IS NULL
    GROUP BY r.parent_site_code
    ORDER BY r.parent_site_code
  `);

  console.log(`\n${'─'.repeat(70)}`);
  console.log('REFERENCE parent_site_codes WITH NO PROJECT MATCH');
  console.log(`${'─'.repeat(70)}`);
  if (unmatchedRef.length > 0) {
    for (const r of unmatchedRef) {
      console.log(`  ${r.parent_site_code}: ${r.site_name} (${r.city}, ${r.state})`);
    }
  } else {
    console.log('  None ✓');
  }

  // =========================================================================
  // 4. Update display columns on sites table
  // =========================================================================
  console.log(`\n${'─'.repeat(70)}`);
  console.log('DISPLAY COLUMN UPDATES');
  console.log(`${'─'.repeat(70)}`);

  // Preview what would be updated
  const [updatePreview] = await db.query(`
    SELECT s.site_code, s.name,
           r.metro_area_name, r.site_name AS ref_site_name,
           r.channel_engagement_manager, r.management_type,
           r.workstations_active, r.ta_workstations_active
    FROM sites s
    JOIN site_reference r ON s.site_code = r.parent_site_code
    ORDER BY s.site_code
  `);

  console.log(`  Sites to update with ProInsights data: ${updatePreview.length}`);

  if (!dryRun && updatePreview.length > 0) {
    const updateSql = `
      UPDATE sites s
      JOIN site_reference r ON s.site_code = r.parent_site_code
      SET s.metro_area_name = r.metro_area_name,
          s.reference_site_name = r.site_name,
          s.channel_engagement_manager = r.channel_engagement_manager,
          s.management_type = r.management_type,
          s.workstations_active = r.workstations_active,
          s.ta_workstations_active = r.ta_workstations_active
    `;

    const [result] = await db.query(updateSql);
    console.log(`  ✓ Updated ${result.affectedRows} sites with ProInsights display data`);

    // Verify a sample
    const [sample] = await db.query(`
      SELECT site_code, name, metro_area_name, reference_site_name, 
             channel_engagement_manager, management_type,
             workstations_active, ta_workstations_active
      FROM sites WHERE metro_area_name IS NOT NULL
      ORDER BY site_code LIMIT 3
    `);
    console.log('\n  Sample updated rows:');
    for (const row of sample) {
      console.log(`    ${row.site_code}: metro=${row.metro_area_name}, mgr=${row.channel_engagement_manager}, ws=${row.workstations_active}`);
    }
  } else if (dryRun) {
    console.log('  (dry run — no changes applied)');
  }

  // =========================================================================
  // Summary
  // =========================================================================
  console.log(`\n${'='.repeat(70)}`);
  console.log('SUMMARY');
  console.log(`${'='.repeat(70)}`);
  console.log(`  State mismatches:       ${stateMismatches.length}`);
  console.log(`  City mismatches:        ${cityMismatches.length}`);
  console.log(`  Unmatched project:      ${unmatchedProject.length}`);
  console.log(`  Unmatched reference:    ${unmatchedRef.length}`);
  console.log(`  Display columns synced: ${dryRun ? '(skipped - dry run)' : updatePreview.length}`);

  if (dryRun && (stateMismatches.length > 0 || cityMismatches.length > 0)) {
    console.log('\n  To apply display column updates, run without --dry-run:');
    console.log('    node src/scripts/sync-reference.js');
  }

  console.log('');
}

syncReference()
  .catch(error => {
    console.error('\n✗ Sync failed:', error.message);
    process.exit(1);
  })
  .finally(() => {
    closeDatabase();
  });
