#!/usr/bin/env node
/**
 * Clean up duplicate alerts based on VTEC codes
 *
 * DEPRECATED: This script is now a wrapper around the unified cleanup module.
 * Use `node src/utils/cleanup-advisories.js vtec` instead.
 *
 * @generated AI-authored (Claude, Warp) — vanilla JS by design
 */

require('dotenv').config();
const { runCleanup } = require('../utils/cleanup-advisories');

console.log('Note: This script is deprecated. Use cleanup-advisories.js with mode "vtec" instead.');
console.log('Running VTEC cleanup via unified module...\n');

runCleanup('vtec');
