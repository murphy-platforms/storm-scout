# Automated Duplicate Prevention System

**Deployment Date**: February 12, 2026  
**Status**: ✅ Fully Operational in Production

## Overview
Storm Scout now has a **three-layer defense** against duplicate weather alerts, ensuring the database always contains current, clean data without manual intervention.

## The Three Layers

### Layer 1: Application-Level VTEC Deduplication (Real-time)
**Location**: `backend/src/models/advisory.js`

**How it works**:
- When ingesting a new alert, the system first checks if an alert with the same VTEC code already exists
- If found, updates the existing alert instead of creating a duplicate
- Falls back to `external_id` based deduplication for alerts without VTEC codes

**Coverage**: 81.8% of alerts (those with VTEC codes)

**Code snippet**:
```javascript
if (advisory.vtec_code) {
  const existing = await this.findByVTEC(
    advisory.vtec_code,
    advisory.site_id,
    advisory.advisory_type
  );
  
  if (existing) {
    return this.update(existing.id, advisory);
  }
}
```

### Layer 2: Database-Level Uniqueness Constraint (Real-time)
**Location**: `vtec_unique_key` generated column + unique index

**How it works**:
- A generated column combines `vtec_code|site_id|advisory_type` for active alerts
- Unique index prevents duplicate inserts at the database level
- Returns NULL for expired alerts or alerts without VTEC (no constraint applied)
- If a duplicate somehow gets past Layer 1, the database rejects it
- Application catches the `ER_DUP_ENTRY` error and updates the existing alert

**Technical details**:
```sql
-- Generated column formula
vtec_unique_key = CASE 
  WHEN status = 'active' AND vtec_code IS NOT NULL 
  THEN CONCAT(vtec_code, '|', site_id, '|', advisory_type)
  ELSE NULL
END

-- Unique index
CREATE UNIQUE INDEX idx_vtec_unique_active ON advisories (vtec_unique_key);
```

**Why this approach**:
- MySQL/MariaDB doesn't support partial indexes (e.g., `WHERE status = 'active'`)
- Generated columns allow us to create a "conditional uniqueness" constraint
- NULL values are ignored by unique indexes, so expired alerts don't conflict

**Error handling** in `advisory.js`:
```javascript
catch (error) {
  if (error.code === 'ER_DUP_ENTRY' && advisory.vtec_code) {
    // Race condition: duplicate inserted between check and insert
    const existing = await this.findByVTEC(...);
    return this.update(existing.id, advisory);
  }
  throw error;
}
```

### Layer 3: Scheduled Cleanup (Daily maintenance)
**Location**: `backend/src/scripts/scheduled-cleanup.js`  
**Schedule**: Daily at 3:00 AM (cron job)

**How it works**:
- Runs a database query to find any VTEC duplicates that may have accumulated
- Keeps the most recently updated alert for each VTEC group
- Deletes older duplicates
- Logs results to `.cleanup-log.json` for monitoring

**When it helps**:
- NOAA temporarily removes an alert from their API, then re-adds it
- Network issues cause ingestion cycles to miss or duplicate
- Alert updates arrive out-of-order
- Race conditions (though Layer 2 prevents most of these)

**Cron configuration**:
```bash
0 3 * * * cd ~/storm-scout && node src/scripts/scheduled-cleanup.js >> ~/storm-scout/cleanup.log 2>&1
```

**Monitoring**:
Check cleanup logs:
```bash
ssh stormscout "tail -50 ~/storm-scout/cleanup.log"
ssh stormscout "cat ~/storm-scout/.cleanup-log.json | jq '.[-5:]'"  # Last 5 runs
```

## Complete Workflow

### Scenario 1: New Alert Arrives
1. **Ingestion** pulls alert from NOAA API
2. **Layer 1** checks: "Do we already have this VTEC?" → No → Insert
3. **Layer 2** enforces: "Is vtec_unique_key already in use?" → No → Allow insert
4. ✅ Alert created

### Scenario 2: Alert Update Arrives (same VTEC, different external_id)
1. **Ingestion** pulls updated alert from NOAA
2. **Layer 1** checks: "Do we already have this VTEC?" → Yes → Update existing
3. ✅ Existing alert updated, no duplicate created

### Scenario 3: Duplicate Slips Through (race condition)
1. Two ingestion processes try to insert the same VTEC simultaneously
2. **Layer 1** both see "no existing alert" at the same moment
3. Both attempt INSERT
4. **Layer 2** constraint blocks the second INSERT
5. Second process catches `ER_DUP_ENTRY`, fetches existing alert, updates it
6. ✅ No duplicate created

### Scenario 4: Network Glitch Creates Legacy Duplicate
1. Old duplicate somehow exists in database (pre-deployment scenario)
2. **Layer 3** scheduled cleanup runs at 3 AM
3. Finds duplicate group, keeps newest, deletes others
4. ✅ Database cleaned automatically

## Benefits

### For Users
- **Always see current, accurate alert counts** on dashboard
- **No confusion** from seeing the same alert multiple times
- **Faster page loads** with fewer database records

### For Operations
- **Zero manual cleanup** required
- **Self-healing** system - duplicates auto-removed daily
- **Database integrity** enforced at the lowest level
- **Easy monitoring** via cleanup logs

### For Performance
- **Fewer database records** = faster queries
- **Efficient indexes** on generated column
- **Cleanup runs off-peak** (3 AM) - no impact on users

## Statistics

**Current Production Status** (as of Feb 12, 2026):
- Active alerts: 147
- Alerts with VTEC codes: 119 (81.8%)
- Alerts without VTEC: 28 (18.2% - mostly Special Weather Statements)
- **VTEC duplicates: 0** ✅

**Historical Performance**:
- Before VTEC deduplication: Site 2703 had 30 alerts (only ~10 unique events)
- After initial cleanup: Removed 22 duplicates across 15 duplicate groups
- Current state: Zero VTEC duplicates

## Monitoring & Maintenance

### Daily Monitoring
The system is self-monitoring. Check for issues:

```bash
# Check if scheduled cleanup is running
ssh stormscout "crontab -l | grep cleanup"

# View recent cleanup logs
ssh stormscout "tail -100 ~/storm-scout/cleanup.log"

# Check cleanup history (JSON log)
ssh stormscout "cat ~/storm-scout/.cleanup-log.json | jq '.[-5:]'"
```

### Alert Thresholds
The system will log warnings if:
- A cleanup run finds more than 5 duplicate groups
- Any single VTEC has more than 3 duplicates

Review logs if you see these warnings.

### Metrics to Track
```sql
-- Check VTEC coverage
SELECT 
  COUNT(*) as total_active,
  COUNT(vtec_code) as with_vtec,
  ROUND(100.0 * COUNT(vtec_code) / COUNT(*), 1) as coverage_pct
FROM advisories 
WHERE status = 'active';

-- Check for any duplicates (should be 0)
SELECT vtec_code, site_id, advisory_type, COUNT(*) as count
FROM advisories
WHERE status = 'active' AND vtec_code IS NOT NULL
GROUP BY vtec_code, site_id, advisory_type
HAVING count > 1;

-- Check constraint effectiveness
SELECT COUNT(*) as total_active, 
       COUNT(DISTINCT vtec_unique_key) as unique_keys
FROM advisories 
WHERE status = 'active';
```

## Rollback Procedures

If you need to remove the system:

### 1. Remove Scheduled Cleanup
```bash
ssh stormscout "crontab -r"  # Remove all cron jobs
# Or selectively edit: crontab -e
```

### 2. Remove Database Constraint
```bash
ssh stormscout "mysql -h localhost -u USER -p DATABASE < ~/storm-scout/backend/src/data/migrations/rollback-vtec-uniqueness-constraint.sql"
```

### 3. Revert Application Code
```bash
git revert f3b035d  # Revert constraint handling
git revert ad69e7c  # Revert VTEC deduplication (if needed)
```

## Files Modified/Created

**New Files**:
- `backend/src/scripts/scheduled-cleanup.js` - Daily cleanup script
- `backend/src/data/migrations/add-vtec-uniqueness-constraint.sql` - Constraint migration
- `backend/src/data/migrations/rollback-vtec-uniqueness-constraint.sql` - Rollback script

**Modified Files**:
- `backend/src/models/advisory.js` - Added constraint violation handling
- `backend/src/ingestion/utils/normalizer.js` - VTEC extraction (from earlier deployment)

**Production Cron**:
- Daily cleanup job at 3 AM in crontab

## Future Enhancements

Potential improvements to consider:

1. **Alerting**: Send notification if cleanup finds >10 duplicates in one run
2. **Metrics Dashboard**: Add cleanup stats to admin dashboard
3. **Retention Policy**: Auto-archive expired alerts older than 90 days
4. **Multi-source deduplication**: Extend to handle duplicates from future alert sources beyond NOAA

## Support

If you encounter issues:

1. Check cleanup logs: `ssh stormscout "cat ~/storm-scout/cleanup.log"`
2. Verify cron is running: `ssh stormscout "crontab -l"`
3. Check for constraint violations in application logs
4. Run manual cleanup: `ssh stormscout "cd storm-scout && node src/scripts/scheduled-cleanup.js"`

For database constraint issues, check:
```sql
SHOW INDEX FROM advisories WHERE Key_name = 'idx_vtec_unique_active';
SELECT * FROM advisories WHERE vtec_unique_key IS NOT NULL LIMIT 5;
```

---

## Summary

Storm Scout now has enterprise-grade duplicate prevention with:
- ✅ **Real-time VTEC deduplication** at application level (Layer 1)
- ✅ **Database-level uniqueness enforcement** via generated column + unique index (Layer 2)
- ✅ **Daily automated cleanup** to catch any edge cases (Layer 3)
- ✅ **Zero manual intervention** required
- ✅ **Self-monitoring** with comprehensive logs
- ✅ **Easy rollback** if needed

The system is production-ready and requires no ongoing maintenance beyond occasional log reviews.
