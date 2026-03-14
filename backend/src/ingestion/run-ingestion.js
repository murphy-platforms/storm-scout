/**
 * Manual Ingestion Runner
 * Run this script to manually trigger weather data ingestion
 * Usage: npm run ingest
 *
 * @generated AI-authored (Claude, Warp) — vanilla JS by design
 */

const { initDatabase, closeDatabase } = require('../config/database');
const { ingestNOAAData } = require('./noaa-ingestor');

async function runIngestion() {
    try {
        // Initialize database connection
        await initDatabase();

        // Run NOAA ingestion
        await ingestNOAAData();

        console.log('\n✓ Manual ingestion completed successfully!');
    } catch (error) {
        console.error('\n✗ Manual ingestion failed:', error.message);
        process.exit(1);
    } finally {
        closeDatabase();
        process.exit(0);
    }
}

runIngestion();
