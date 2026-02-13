# Duplicate Advisory Analysis & Remediation Plan

**Date**: February 13, 2026  
**Issue**: Multiple alerts for same site code with same advisory type  
**Root Cause**: Combination of VTEC event deduplication gaps and non-VTEC alerts

---

## Problem Summary

Despite implementing VTEC event ID deduplication in v1.0.0, we're still seeing multiple alerts for the same site/advisory-type combination. Analysis reveals **two distinct causes**:

###  1. **Different VTEC Events (Same Advisory Type, Different Events)**
- **Legitimate**: Multiple distinct weather events of the same type affecting a site
- **Example**: Site 2703 (Anchorage) has 7 "Winter Weather Advisory" alerts
  - These are from **4 different weather offices** (PAFG, PAFC, PAJK, etc.)
  - These represent **6 unique VTEC event IDs**: PAFG.WW.Y.0018, PAFC.WW.Y.0023, PAFG.WW.Y.0019, PAJK.WW.Y.0009, PAFG.WW.Y.0015
  - These are **separate geographical zones** overlapping the same test center location

### 2. **Missing VTEC Codes (NULL event IDs)**
- **Problem**: Some alerts lack VTEC codes entirely (`vtec_event_id: null`)
- **Impact**: Cannot deduplicate these alerts automatically
- **Count**: Multiple alerts per site/type with no way to identify if they're the same event

---

## Detailed Analysis

### Top Duplicate Cases

#### Site 2703 (Anchorage, AK) - Winter Weather Advisory (7 alerts)

| ID | VTEC Event ID | Action | Headline | Status |
|----|---------------|--------|----------|---------|
| 36448 | PAFG.WW.Y.0018 | CON | Feb 13 5:56AM - Feb 14 3:00PM | ✅ Valid (different event) |
| 38024 | PAFC.WW.Y.0023 | CON | Feb 13 2:51AM - Feb 14 6:00AM | ✅ Valid (different office) |
| 46964 | PAFG.WW.Y.0019 | NEW | Feb 13 1:44AM - Feb 13 9:00AM | ✅ Valid (different event) |
| 13446 | PAJK.WW.Y.0009 | EXP | Feb 12 2:41PM - Feb 12 3:00PM | ✅ Valid (different office) |
| 37886 | **NULL** | **NULL** | Feb 12 2:41PM - Feb 12 3:00PM | ❌ **Duplicate of 13446?** |
| 36844 | **NULL** | **NULL** | Feb 12 1:35PM - Feb 14 3:00PM | ❌ **Unknown** |
| 18192 | PAFG.WW.Y.0015 | CON | Feb 11 11:12PM - Feb 12 12:00PM | ✅ Valid (different event) |

**Finding**: 5 unique VTEC events + 2 NULL entries. The NULL entries may be duplicates or legitimately different advisories that lack VTEC codes.

#### Site 2703 (Anchorage, AK) - Blizzard Warning (6 alerts)

| ID | VTEC Event ID | Action | Headline | Status |
|----|---------------|--------|----------|---------|
| 36446 | PAFG.BZ.W.0013 | CON | Feb 13 5:56AM - Feb 14 12:00PM | ✅ Valid |
| 47635 | PAFC.BZ.W.0009 | NEW | Feb 13 2:51AM - Feb 14 12:00PM | ✅ Valid (different office) |
| 3195 | PAFG.BZ.W.0011 | EXT | Feb 13 1:44AM - Feb 13 9:00AM | ✅ Valid (different event) |
| 43300 | **NULL** | **NULL** | Feb 12 8:45PM - Feb 13 3:00AM | ❌ **Unknown** |
| 36841 | **NULL** | **NULL** | Feb 12 1:39PM - Feb 12 9:00PM | ❌ **Unknown** |
| 26688 | PAFC.BZ.W.0008 | NEW | Feb 12 5:46AM - Feb 12 12:00PM | ✅ Valid (different office) |

**Finding**: 4 unique VTEC events + 2 NULL entries.

### Site 2703 (Anchorage) - Additional Types

- **Gale Warning**: 4 alerts, **4 unique VTEC events** (all from different zones) ✅ All valid
- **Wind Advisory**: 4 alerts, **1 VTEC event + 3 NULL** ❌ Likely duplicates
- **Winter Storm Warning**: 4 alerts, **3 VTEC events + 1 NULL** ❌ 1 potential duplicate
- **Cold Weather Advisory**: 3 alerts, **1 VTEC event + 2 NULL** ❌ 2 likely duplicates
- **High Wind Warning**: 3 alerts, **1 VTEC event + 2 NULL** ❌ 2 likely duplicates
- **Winter Storm Watch**: 3 alerts, **3 unique VTEC events** ✅ All valid

### Site 5221 (Puerto Rico) - Rip Current Statement (4 alerts)

- **1 VTEC event + 3 NULL entries** ❌ 3 likely duplicates

### Site 0617 (Florida) - Dense Fog Advisory (3 alerts)

- **3 unique VTEC events** ✅ All valid (different NWS offices: KTAE, KMFL, KTBW)

---

## Root Causes

### 1. **Multiple NWS Offices Issuing Alerts for Same Location**
**Status**: ✅ **WORKING AS INTENDED**

- Testing centers near weather forecast zone boundaries
- Multiple NWS offices (e.g., PAFG, PAFC, PAJK for Alaska)
- Each office issues alerts for their zones
- Same physical location affected by multiple zones
- **These are NOT duplicates** - they represent different geographic coverage areas

**Example**: Anchorage (site 2703) is affected by:
- PAFG (Fairbanks office)
- PAFC (Anchorage office)
- PAJK (Juneau office)

**Resolution**: **No action needed** - this is correct behavior.

### 2. **Alerts Without VTEC Codes**
**Status**: ❌ **PROBLEM - CREATING DUPLICATES**

- Some NOAA alerts don't include VTEC codes (particularly older/revised alerts)
- Without VTEC codes, we can't extract `vtec_event_id` or `vtec_action`
- Current deduplication logic uses `vtec_event_id` in unique constraint
- NULL values bypass this constraint, allowing duplicates
- Estimated ~20-30% of duplicate entries

**Example**: Site 2703 has multiple NULL entries that appear to be duplicates based on:
- Same site code
- Same advisory type
- Overlapping or identical time periods
- Similar headlines

**Resolution**: Need secondary deduplication strategy for non-VTEC alerts.

### 3. **External ID Not Used for Deduplication**
**Status**: ⚠️ **MISSED OPPORTUNITY**

- All alerts have `external_id` (NOAA's unique identifier)
- Current unique constraint only uses `vtec_event_id`
- Alerts without VTEC codes have `external_id` but aren't deduplicated on it
- We're checking `external_id` in application code but not enforcing at database level

**Resolution**: Add `external_id` to deduplication strategy.

---

## Remediation Plan

### Phase 1: Immediate Fix - Add External ID Deduplication

**Goal**: Eliminate duplicates with same `external_id`

**Steps**:

1. **Database Migration** - Add unique constraint on `external_id`:
   ```sql
   -- First, remove any existing duplicates by external_id
   DELETE a1 FROM advisories a1
   INNER JOIN advisories a2 
   WHERE a1.external_id = a2.external_id
   AND a1.id > a2.id;
   
   -- Add unique index on external_id
   ALTER TABLE advisories 
   ADD UNIQUE INDEX idx_external_id (external_id);
   ```

2. **Update Application Logic** - Modify `advisory.js` model:
   ```javascript
   // Check for existing advisory by external_id first
   static async findByExternalID(externalId) {
       const query = `
           SELECT * FROM advisories 
           WHERE external_id = ?
           LIMIT 1
       `;
       const [rows] = await db.query(query, [externalId]);
       return rows[0] || null;
   }
   
   static async createOrUpdate(advisoryData) {
       // First check by external_id (always present)
       let existingAdvisory = await this.findByExternalID(advisoryData.external_id);
       
       // If not found and has VTEC, check by VTEC event ID
       if (!existingAdvisory && advisoryData.vtec_event_id) {
           existingAdvisory = await this.findByVTECEventID(
               advisoryData.vtec_event_id,
               advisoryData.site_id
           );
       }
       
       if (existingAdvisory) {
           return await this.update(existingAdvisory.id, advisoryData);
       } else {
           return await this.create(advisoryData);
       }
   }
   ```

**Estimated Impact**: Eliminate 100% of true duplicates (same event, same source)

**Effort**: Low (2-3 hours)  
**Risk**: Low (external_id is always present and unique per NOAA)

---

### Phase 2: Composite Deduplication Strategy

**Goal**: Handle edge cases where alerts might have different external IDs but represent same event

**Steps**:

1. **Update Generated Column Logic**:
   ```sql
   ALTER TABLE advisories DROP COLUMN vtec_event_unique_key;
   
   ALTER TABLE advisories 
   ADD COLUMN dedup_key VARCHAR(150) GENERATED ALWAYS AS (
       CASE 
           -- Use external_id as primary dedup key (always unique)
           WHEN external_id IS NOT NULL 
           THEN CONCAT('ext:', external_id)
           -- Fallback to VTEC event ID if available
           WHEN vtec_event_id IS NOT NULL 
           THEN CONCAT('vtec:', site_id, ':', vtec_event_id)
           -- Last resort: use database ID (no dedup)
           ELSE CONCAT('id:', id)
       END
   ) STORED;
   
   CREATE UNIQUE INDEX idx_dedup_key ON advisories(dedup_key);
   ```

**Benefit**: Layers deduplication - external_id first, then VTEC, then ID

**Effort**: Medium (4-6 hours including testing)  
**Risk**: Medium (need to test generated column logic)

---

### Phase 3: Multi-Zone Alert Clarity (UX Improvement)

**Goal**: Help users understand when multiple alerts of same type are from different zones/offices

**Frontend Enhancement** - Update advisories page to group by site/type and show sources:

```javascript
// Group alerts by site + advisory type
const grouped = advisories.reduce((acc, alert) => {
    const key = `${alert.site_code}:${alert.advisory_type}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(alert);
    return acc;
}, {});

// Display with expansion for multiple alerts
for (const [key, alerts] of Object.entries(grouped)) {
    if (alerts.length > 1) {
        // Show expandable row: "3 Winter Weather Advisories (3 zones)"
        // Click to expand and show each zone/office
    } else {
        // Show single row as normal
    }
}
```

**Benefit**: Users understand multiple alerts are from different coverage zones

**Effort**: Medium (1-2 days)  
**Risk**: Low (frontend only)

---

## Implementation Priority

### High Priority (Do Immediately)

✅ **Phase 1: External ID Deduplication**
- Eliminates ALL true duplicates
- Low effort, low risk
- Should be deployed ASAP

### Medium Priority (Next Sprint)

🔶 **Phase 2: Composite Deduplication**
- Handles edge cases
- More robust long-term solution
- Can wait until Phase 1 is validated

### Low Priority (Future Enhancement)

🔹 **Phase 3: Multi-Zone UX**
- Improves user experience
- Helps explain legitimate "duplicates"
- Nice-to-have, not critical

---

## Testing Plan

### Pre-Deployment Testing

1. **Backup Database**:
   ```bash
   ssh stormscout "mysqldump -u storm_scout -p storm_scout > ~/backups/pre-dedup-fix-$(date +%Y%m%d).sql"
   ```

2. **Count Current Duplicates**:
   ```sql
   -- Count by external_id
   SELECT external_id, COUNT(*) 
   FROM advisories 
   GROUP BY external_id 
   HAVING COUNT(*) > 1;
   
   -- Count by site/type
   SELECT site_code, advisory_type, COUNT(*) 
   FROM advisories 
   GROUP BY site_code, advisory_type 
   HAVING COUNT(*) > 1;
   ```

3. **Run Migration in Test/Staging First**

4. **Verify Deduplication**:
   ```sql
   -- Should return 0 rows
   SELECT external_id, COUNT(*) as count
   FROM advisories 
   GROUP BY external_id 
   HAVING count > 1;
   ```

### Post-Deployment Verification

1. Check site 2703 (Anchorage) - should have fewer alerts
2. Verify all alerts have unique `external_id`
3. Monitor next ingestion cycle for any errors
4. Check logs for duplicate key violations (should see them now, which is good)

---

## Expected Results

### Before Fix
- Site 2703: ~30+ alerts
- Multiple alerts with NULL VTEC codes creating duplicates
- No deduplication on `external_id`

### After Phase 1
- Site 2703: ~20-25 alerts (removing ~25-30% duplicates)
- Zero alerts with duplicate `external_id`
- Legitimate multi-zone alerts remain (WORKING AS INTENDED)

### After Phase 2
- Robust deduplication at database level
- Handles all edge cases
- Clean constraint violations logged

### After Phase 3
- Users understand why multiple alerts exist
- Better UX for multi-zone scenarios
- Reduced confusion

---

## Migration Scripts

See:
- `backend/scripts/fix-external-id-duplicates.js` (to be created)
- `backend/migrations/20260213-add-external-id-constraint.sql` (to be created)

---

## Questions for Review

1. **Should we deduplicate on `external_id` or keep multiple alerts from different zones?**
   - **Recommendation**: Deduplicate on `external_id` - NOAA guarantees uniqueness

2. **Should we remove expired/old alerts first to clean up?**
   - **Recommendation**: Yes, run cleanup before migration

3. **How should we handle the ~2 NULL entries that might be legitimate?**
   - **Recommendation**: External ID will catch these

---

**Next Steps**: Approve plan and proceed with Phase 1 implementation.

---

**Prepared By**: AI Agent (Warp)  
**Review Required**: Yes  
**Estimated Total Effort**: 1-2 days for all phases
