# VTEC Event ID Deployment Plan

**Date**: February 12, 2026  
**Purpose**: Fix duplicate alerts by using VTEC event ID instead of full VTEC string  
**Status**: Ready for Deployment

## Problem Summary

Current system creates duplicates when NOAA updates alerts:
- **Site 219 (2703)**: 11 duplicate alerts across 4 event types
- **Root cause**: Full VTEC string changes (NEW→CON→EXT) but event number stays the same
- **Example**: Event `PAJK.HW.W.0006` has 3 database entries (NEW, CON with different timestamps)

## Solution

**Extract persistent event ID** from VTEC and use it for deduplication:
- Event ID format: `OFFICE.PHENOM.SIG.EVENT_NUM` (e.g., `PAJK.HW.W.0006`)
- Also capture **action code** (NEW/CON/EXT) for IMT/Operations visibility
- Deduplicate on event ID while displaying action status to users

## Deployment Steps

### Step 1: Run Database Migration
```bash
# Upload migration
scp -P REDACTED_PORT backend/src/data/migrations/add-vtec-event-id-and-action.sql stormscout:~/

# Execute migration
ssh stormscout "mysql -h localhost -u ***REDACTED*** -p'***REDACTED_PASSWORD***' ***REDACTED*** < ~/add-vtec-event-id-and-action.sql"
```

**What it does**:
- Adds `vtec_event_id` column (e.g., "PAJK.HW.W.0006")
- Adds `vtec_action` column (e.g., "NEW", "CON", "EXT")
- Drops old `vtec_unique_key` constraint
- Creates new `vtec_event_unique_key` constraint
- Adds performance indexes

**Expected output**: Migration completed successfully

### Step 2: Deploy Code Changes
```bash
# Deploy normalizer (extracts event ID and action)
scp -P REDACTED_PORT backend/src/ingestion/utils/normalizer.js stormscout:~/storm-scout/src/ingestion/utils/

# Deploy advisory model (uses event ID for deduplication)
scp -P REDACTED_PORT backend/src/models/advisory.js stormscout:~/storm-scout/src/models/

# Deploy scripts
scp -P REDACTED_PORT backend/src/scripts/backfill-vtec-event-id.js stormscout:~/storm-scout/src/scripts/
scp -P REDACTED_PORT backend/src/scripts/cleanup-event-id-duplicates.js stormscout:~/storm-scout/src/scripts/
```

### Step 3: Restart Application
```bash
ssh stormscout "touch storm-scout/tmp/restart.txt"
```

### Step 4: Backfill Event IDs and Actions
```bash
ssh stormscout "cd storm-scout && /opt/alt/alt-nodejs20/root/usr/bin/node src/scripts/backfill-vtec-event-id.js"
```

**What it does**:
- Extracts event IDs from existing `vtec_code` values
- Populates `vtec_event_id` and `vtec_action` columns
- Shows distribution of action codes

**Expected results**:
- ~140-160 alerts processed
- Action distribution (NEW, CON, EXT, etc.)
- 0 failures

### Step 5: Clean Up Duplicates
```bash
ssh stormscout "cd storm-scout && /opt/alt/alt-nodejs20/root/usr/bin/node src/scripts/cleanup-event-id-duplicates.js"
```

**What it does**:
- Finds alerts with same event ID
- Keeps highest priority action (CON/EXT > NEW)
- Deletes older duplicates

**Expected results**:
- Site 219: ~11 duplicates removed
- Keeps most recent CON/EXT version
- Alerts reduced from ~147 to ~136

### Step 6: Verification
```bash
# Check schema
ssh stormscout "mysql -h localhost -u ***REDACTED*** -p'***REDACTED_PASSWORD***' ***REDACTED*** -e 'SHOW COLUMNS FROM advisories WHERE Field IN (\"vtec_event_id\", \"vtec_action\");'"

# Check for remaining duplicates
ssh stormscout "mysql -h localhost -u ***REDACTED*** -p'***REDACTED_PASSWORD***' ***REDACTED*** -e 'SELECT vtec_event_id, site_id, advisory_type, COUNT(*) as count FROM advisories WHERE status=\"active\" AND vtec_event_id IS NOT NULL GROUP BY vtec_event_id, site_id, advisory_type HAVING count > 1;'"

# Check site 219 (should be ~19 alerts instead of 30)
ssh stormscout "mysql -h localhost -u ***REDACTED*** -p'***REDACTED_PASSWORD***' ***REDACTED*** -e 'SELECT COUNT(*) as count FROM advisories WHERE site_id = 219 AND status=\"active\";'"

# View action code distribution
ssh stormscout "mysql -h localhost -u ***REDACTED*** -p'***REDACTED_PASSWORD***' ***REDACTED*** -e 'SELECT vtec_action, COUNT(*) as count FROM advisories WHERE status=\"active\" GROUP BY vtec_action;'"
```

## Expected Outcomes

### Before Deployment
- Site 219 (Anchorage): ~30 active alerts
- High Wind Warning 0006: 3 duplicates
- Wind Advisory 0011: 3 duplicates  
- Winter Storm Warning 0005: 3 duplicates
- Winter Weather Advisory 0009: 2 duplicates

### After Deployment
- Site 219: ~19 active alerts (unique events only)
- All event IDs: 1 alert per event
- Action codes visible: NEW, CON, EXT, EXP
- Zero event ID duplicates

## Benefits for IMT/Operations

**Before**: "Site has 3 High Wind Warnings" (confusing - it's the same warning!)

**After**: "Site has 1 High Wind Warning [CONTINUED]" (clear - it's ongoing)

Action badges will show:
- 🆕 **NEW** - Alert just issued
- 🔄 **CONTINUED** - Alert ongoing  
- ⏱️ **EXTENDED** - Alert time extended
- ⚠️ **UPGRADED** - Severity increased
- ❌ **EXPIRED** - Alert ended
- 🚫 **CANCELLED** - Alert cancelled

## Rollback Plan

If issues arise:

```bash
# Rollback database
ssh stormscout "mysql -h localhost -u ***REDACTED*** -p'***REDACTED_PASSWORD***' ***REDACTED*** < ~/rollback-vtec-event-id-and-action.sql"

# Revert code
git revert 73f76f3
# Re-deploy previous versions of normalizer.js and advisory.js
```

## Post-Deployment Monitoring

Monitor for 24-48 hours:

```bash
# Check ingestion logs for event ID updates
ssh stormscout "tail -100 ~/storm-scout/stderr.log | grep 'Updating existing event'"

# Verify no duplicates accumulating
ssh stormscout "mysql -h localhost -u ***REDACTED*** -p'***REDACTED_PASSWORD***' ***REDACTED*** -e 'SELECT COUNT(*) FROM (SELECT vtec_event_id FROM advisories WHERE status=\"active\" AND vtec_event_id IS NOT NULL GROUP BY vtec_event_id, site_id HAVING COUNT(*) > 1) as dups;'"
```

Expected: 0 duplicates, log entries showing "[CON]", "[EXT]", etc. updates

## Next Steps After Deployment

1. **Update Frontend** (separate task):
   - Display action badges (NEW/CONTINUED/EXTENDED)
   - Show alert update history
   - Add filtering by action code

2. **Update Scheduled Cleanup** (already configured):
   - Daily cleanup will automatically use event IDs
   - No changes needed

3. **Documentation**:
   - Update API documentation to include `vtec_event_id` and `vtec_action`
   - Add user guide for action codes

## Files Changed

**Database**:
- `add-vtec-event-id-and-action.sql`
- `rollback-vtec-event-id-and-action.sql`

**Backend**:
- `backend/src/ingestion/utils/normalizer.js`
- `backend/src/models/advisory.js`

**Scripts**:
- `backend/src/scripts/backfill-vtec-event-id.js`
- `backend/src/scripts/cleanup-event-id-duplicates.js`

**Documentation**:
- `VTEC-DUPLICATION-ANALYSIS.md`
- `VTEC-EVENT-ID-DEPLOYMENT-PLAN.md` (this file)

## Support

If issues arise during deployment:
1. Check logs: `tail -100 ~/storm-scout/stderr.log`
2. Verify schema: `SHOW COLUMNS FROM advisories;`
3. Test extraction: Run backfill script and check output
4. Rollback if needed using rollback script

---

**Ready to deploy?** Proceed with Step 1 when approved.
