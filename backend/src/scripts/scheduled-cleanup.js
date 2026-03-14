#!/usr/bin/env node
/**
 * Scheduled Advisory Cleanup
 * Runs daily to remove duplicates and expired advisories
 * Designed to be run via cron (e.g., daily at 3 AM)
 *
 * Usage: node scheduled-cleanup.js [mode]
 * Modes: full (default), vtec, event_id, expired, duplicates
 *
 * @generated AI-authored (Claude, Warp) — vanilla JS by design
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { runCleanup } = require('../utils/cleanup-advisories');

const LOG_FILE = path.join(__dirname, '../../.cleanup-log.json');

async function scheduledCleanup() {
    const mode = process.argv[2] || 'full';
    const timestamp = new Date().toISOString();

    console.log(`\n═══ Scheduled Advisory Cleanup Started ═══`);
    console.log(`Time: ${timestamp}`);
    console.log(`Mode: ${mode}\n`);

    try {
        // Run cleanup with logging but don't exit immediately
        const results = await runCleanup(mode, { exitOnComplete: false });

        // Log results to file for monitoring
        const logEntry = {
            timestamp,
            mode,
            ...results
        };

        // Append to log file
        let logs = [];
        if (fs.existsSync(LOG_FILE)) {
            try {
                logs = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
            } catch (e) {
                logs = [];
            }
        }

        logs.push(logEntry);

        // Keep only last 30 days of logs
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        logs = logs.filter((log) => new Date(log.timestamp) > thirtyDaysAgo);

        fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2));

        console.log(`Results logged to ${LOG_FILE}`);

        process.exit(results.success ? 0 : 1);
    } catch (error) {
        console.error('\n✗ Scheduled cleanup failed:', error);
        process.exit(1);
    }
}

scheduledCleanup();
