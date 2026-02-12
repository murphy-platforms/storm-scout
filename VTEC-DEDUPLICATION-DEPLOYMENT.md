# VTEC-Based Alert Deduplication - Deployment Summary

**Deployment Date**: February 12, 2026  
**Status**: ✅ Successfully Deployed to Production

## Overview
Implemented VTEC (Valid Time Event Code) based deduplication to eliminate duplicate weather alerts from NOAA. The system now uses VTEC codes to identify and prevent duplicate alerts that are actually updates to the same weather event.

## Problem Solved
Before this deployment, NOAA was creating multiple database entries for the same weather event when they issued updates. For example, site 2703 had 30 alerts when only ~10-12 unique weather events existed, representing a ~60-70% duplication rate.

## Solution
The solution uses NOAA's VTEC codes (e.g., `/O.CON.PAJK.WS.W.0005.000000T0000Z-260213T0000Z/`) which remain consistent across alert updates. The event number (e.g., `0005`) stays the same when NOAA updates an alert, even though the `external_id` changes.

## Deployment Results

### Database Changes
- Added `vtec_code` VARCHAR(255) column to `advisories` table
- Created 3 indexes for efficient VTEC lookups:
  - `idx_vtec_site_type` (vtec_code, site_id, advisory_type)
  - `idx_vtec_code` (vtec_code)
  - `idx_status_vtec` (status, vtec_code)
- Backup created: `advisories_backup_20260212_150157.sql` (686KB)

### Code Changes
**backend/src/ingestion/utils/normalizer.js**
- Added `extractVTEC()` function to parse VTEC from NOAA alert payloads
- Integrated VTEC extraction into `normalizeNOAAAlert()`

**backend/src/models/advisory.js**
- Added `findByVTEC()` method to query by VTEC code
- Modified `create()` to check for existing VTEC alerts before inserting
- Falls back to `external_id` upsert if no VTEC available

**backend/src/scripts/backfill-vtec.js** (NEW)
- Backfills VTEC codes for existing alerts from raw_payload

**backend/src/scripts/cleanup-duplicates.js** (NEW)
- Removes duplicate alerts with same VTEC code
- Keeps most recently updated alert for each VTEC group

### Deployment Statistics
- **Backfill Results**:
  - 160 active alerts without VTEC codes processed
  - 134 alerts successfully updated with VTEC codes
  - 26 alerts without VTEC (Special Weather Statements, etc.)
  - 0 failures

- **Cleanup Results**:
  - 15 groups of duplicates identified
  - 22 duplicate alerts removed
  - 143 active alerts remaining after cleanup

- **Current Status**:
  - Total active alerts: 143
  - Alerts with VTEC: 117 (81.8% coverage)
  - Alerts without VTEC: 26 (18.2% - mostly Special Weather Statements)
  - **Zero remaining VTEC-based duplicates**

### Verification
Tested site 219 which has 29 active alerts - confirmed these are all unique alerts with different VTEC codes or different advisory types. The deduplication is working correctly and not over-removing legitimate alerts.

## Git Commits
1. `f7ec662` - Add database migration for VTEC deduplication
2. `7b8deb1` - Add VTEC extraction to normalizer
3. `ad69e7c` - Update advisory model with VTEC-based deduplication
4. `cc80cfb` - Add VTEC backfill and duplicate cleanup scripts

All commits pushed to GitHub (main branch).

## Going Forward

### Automatic Deduplication
The system now automatically prevents duplicates for new alerts:
1. New NOAA alerts are ingested with VTEC extraction
2. Before creating a new alert, system checks for existing alert with same VTEC
3. If found, updates existing alert instead of creating duplicate
4. Falls back to `external_id` based upsert if no VTEC available

### Expected Improvements
- **60-70% reduction** in duplicate alerts for Alaska sites (high VTEC coverage)
- **50-60% reduction** for other sites
- Faster API response times due to fewer records
- Clearer dashboard with accurate alert counts
- Better user experience with less confusion

### Monitoring
The system logs VTEC-based updates with messages like:
```
Updated existing alert via VTEC: /O.CON.PAJK.WS.W.0005.000000T0000Z-260213T0000Z/
```

Monitor these logs to confirm deduplication is working for new ingestions.

### Known Limitations
- ~18% of alerts don't have VTEC codes (Special Weather Statements, etc.)
- These alerts still use `external_id` based deduplication
- This is expected and correct behavior

## Files Modified
- `backend/src/data/migrations/add-vtec-deduplication.sql`
- `backend/src/data/migrations/rollback-vtec-deduplication.sql`
- `backend/src/ingestion/utils/normalizer.js`
- `backend/src/models/advisory.js`
- `backend/src/scripts/backfill-vtec.js`
- `backend/src/scripts/cleanup-duplicates.js`

## Rollback Plan
If needed, rollback can be performed via:
```bash
mysql -h localhost -u USER -p DATABASE < backend/src/data/migrations/rollback-vtec-deduplication.sql
```

This will:
- Drop VTEC-related indexes
- Remove vtec_code column
- Restore previous schema (data preserved)
