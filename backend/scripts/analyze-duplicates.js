/**
 * Analyze Advisory Duplicates
 * Find offices with multiple alerts of the same advisory type
 */

const { getDatabase } = require('../src/config/database');

async function analyzeDuplicates() {
    const db = getDatabase();
    
    console.log('\n═══ Advisory Duplicate Analysis ═══\n');
    
    // Find office/advisory_type combinations with multiple alerts
    const [duplicates] = await db.query(`
        SELECT 
            site_code,
            advisory_type,
            COUNT(*) as alert_count,
            GROUP_CONCAT(DISTINCT vtec_event_id ORDER BY vtec_event_id SEPARATOR ', ') as event_ids,
            GROUP_CONCAT(DISTINCT vtec_action ORDER BY vtec_action SEPARATOR ', ') as actions,
            GROUP_CONCAT(id ORDER BY id) as advisory_ids
        FROM advisories
        GROUP BY site_code, advisory_type
        HAVING alert_count > 1
        ORDER BY alert_count DESC, site_code
        LIMIT 30
    `);
    
    console.log(`Found ${duplicates.length} office/advisory-type combinations with duplicates:\n`);
    
    for (const dup of duplicates) {
        console.log(`📍 Office ${dup.site_code} - ${dup.advisory_type}`);
        console.log(`   Count: ${dup.alert_count} alerts`);
        console.log(`   Event IDs: ${dup.event_ids || 'NULL'}`);
        console.log(`   Actions: ${dup.actions || 'NULL'}`);
        console.log(`   Advisory IDs: ${dup.advisory_ids}`);
        console.log('');
    }
    
    // Detailed analysis of worst offenders
    console.log('\n═══ Detailed Analysis of Top Duplicates ═══\n');
    
    for (let i = 0; i < Math.min(5, duplicates.length); i++) {
        const dup = duplicates[i];
        console.log(`\n🔍 Office ${dup.site_code} - ${dup.advisory_type} (${dup.alert_count} alerts)`);
        
        const [alerts] = await db.query(`
            SELECT 
                id,
                external_id,
                vtec_code,
                vtec_event_id,
                vtec_action,
                headline,
                effective,
                expires,
                last_updated
            FROM advisories
            WHERE site_code = ? AND advisory_type = ?
            ORDER BY effective DESC, last_updated DESC
        `, [dup.site_code, dup.advisory_type]);
        
        alerts.forEach((alert, idx) => {
            console.log(`\n   Alert ${idx + 1} (ID: ${alert.id}):`);
            console.log(`      VTEC Event: ${alert.vtec_event_id || 'NULL'}`);
            console.log(`      VTEC Action: ${alert.vtec_action || 'NULL'}`);
            console.log(`      External ID: ${alert.external_id.substring(0, 60)}...`);
            console.log(`      Effective: ${alert.effective}`);
            console.log(`      Expires: ${alert.expires}`);
            console.log(`      Updated: ${alert.last_updated}`);
            console.log(`      Headline: ${alert.headline.substring(0, 80)}...`);
        });
    }
    
    // Summary statistics
    console.log('\n\n═══ Summary Statistics ═══\n');
    
    const [stats] = await db.query(`
        SELECT 
            COUNT(*) as total_advisories,
            COUNT(DISTINCT site_code) as sites_with_alerts,
            COUNT(DISTINCT CONCAT(site_code, ':', advisory_type)) as unique_combinations,
            COUNT(DISTINCT vtec_event_id) as unique_events,
            SUM(CASE WHEN vtec_event_id IS NULL THEN 1 ELSE 0 END) as no_vtec_count
        FROM advisories
    `);
    
    console.log(`Total Advisories: ${stats[0].total_advisories}`);
    console.log(`Offices with Alerts: ${stats[0].sites_with_alerts}`);
    console.log(`Unique Office/Type Combinations: ${stats[0].unique_combinations}`);
    console.log(`Unique VTEC Events: ${stats[0].unique_events}`);
    console.log(`Alerts without VTEC: ${stats[0].no_vtec_count}`);
    
    const duplicateCount = stats[0].total_advisories - stats[0].unique_combinations;
    console.log(`\nPotential Duplicates: ${duplicateCount} (${stats[0].total_advisories} - ${stats[0].unique_combinations})`);
    
    process.exit(0);
}

// Initialize database and run
const { initDatabase } = require('../src/config/database');
initDatabase().then(analyzeDuplicates).catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
