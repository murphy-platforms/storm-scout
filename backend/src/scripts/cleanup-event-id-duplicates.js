#!/usr/bin/env node
/**
 * Clean up duplicates based on VTEC Event IDs
 *
 * DEPRECATED: This script is now a wrapper around the unified cleanup module.
 * Use `node src/utils/cleanup-advisories.js event_id` instead.
 *
 * @generated AI-authored (Claude, Warp) — vanilla JS by design
 */

require('dotenv').config();
const { runCleanup } = require('../utils/cleanup-advisories');

console.log('Note: This script is deprecated. Use cleanup-advisories.js with mode "event_id" instead.');
console.log('Running Event ID cleanup via unified module...\n');

runCleanup('event_id');
