# Duplicate NOAA Alerts Analysis - Site 2703

**Analysis Date**: February 12, 2026  
**Site**: 2703 - Anchorage Testing Center (Anchorage, AK)  
**Total Active Alerts**: 30 alerts from multiple NOAA sources

## Executive Summary

Site 2703 (Anchorage, Alaska) currently has **30 active weather advisories**, with significant duplication occurring across multiple alert types. The primary cause is **NOAA issuing updates to the same weather event with different external IDs**, which our system treats as separate alerts rather than updates to existing alerts.

## Problem Identification

### Duplicate Alert Counts by Type

| Alert Type | Count | Sources | Status |
|------------|-------|---------|--------|
| **Winter Weather Advisory** | 7 | Anchorage, Fairbanks, Juneau | ❌ SEVERE |
| **Blizzard Warning** | 4 | Anchorage, Fairbanks | ❌ HIGH |
| **Gale Warning** | 4 | Anchorage, Juneau | ❌ HIGH |
| **High Wind Warning** | 3 | Juneau | ⚠️ MODERATE |
| **Winter Storm Warning** | 3 | Juneau | ⚠️ MODERATE |
| **Wind Advisory** | 3 | Juneau | ⚠️ MODERATE |
| **Storm Warning** | 2 | Juneau | ⚠️ MODERATE |
| **Special Weather Statement** | 2 | Anchorage, Fairbanks | ⚠️ MODERATE |
| **Cold Weather Advisory** | 1 | Fairbanks | ✅ OK |
| **Marine Weather Statement** | 1 | Juneau | ✅ OK |

### Total Duplicates
- **Expected**: ~10-12 unique weather events
- **Actual**: 30 alerts stored
- **Duplication Rate**: ~60-70% duplicate entries

## Root Cause Analysis

### Issue 1: NOAA Alert Updates Create New Entries

**Example: Winter Storm Warning (3 entries for same event)**

```
ID 27672: urn:oid:2.49.0.1.840.0.31c954d6c2750576d7ed939f627070ac0d24a926.001.1
- Issued: Feb 12, 6:35 AM AKST
- Zone: AKZ319 (Haines Borough)
- Message Type: UPDATE

ID 13445: urn:oid:2.49.0.1.840.0.06c5a4a193c1cd21ad68fa35d8e88cd17a88a9a9.001.1  
- Issued: Feb 11, 7:43 PM AKST
- Zone: AKZ319 (Haines Borough)
- Message Type: ALERT

ID 3205: urn:oid:2.49.0.1.840.0.f6d4bbeba6ed81d1b06b036211e9cf36efdda942.002.2
- Issued: Feb 11, 11:43 AM AKST
- Zone: AKZ319 (Haines Borough)
- Message Type: ALERT
```

**Analysis**: These are 3 updates to the SAME weather event affecting the same geographic zone (AKZ319), but NOAA assigns different `external_id` values for each update. Our current logic uses `external_id` as the unique identifier, causing each update to create a NEW database entry instead of updating the existing one.

### Issue 2: NOAA Alert References Not Being Processed

NOAA alerts include a `references` field that links updates to previous alerts:

```json
"references": [{
  "@id": "https://api.weather.gov/alerts/urn:oid:2.49.0.1.840.0.06c5a4a193c1cd21ad68fa35d8e88cd17a88a9a9.001.1",
  "identifier": "urn:oid:2.49.0.1.840.0.06c5a4a193c1cd21ad68fa35d8e88cd17a88a9a9.001.1",
  "sender": "w-nws.webmaster@noaa.gov",
  "sent": "2026-02-11T19:43:00-09:00"
}]
```

**Current Behavior**: Our ingestion process stores the entire `raw_payload` but doesn't process the `references` field to identify and consolidate alert updates.

### Issue 3: Multiple Geographic Zones Affecting Single Site

Alaska's geography causes multiple NOAA forecast zones to overlap the Anchorage area:
- **AKZ319**: Haines Borough (170+ miles from Anchorage)
- **AKZ701**: Anchorage Bowl
- **AKZ711**: Lower Matanuska Valley
- **AKZ722/723**: Kenai Peninsula
- **PKZ311/312**: Gulf of Alaska offshore waters

**Problem**: Our geocoding logic maps site 2703 (Anchorage) to ALL of these zones, so ANY alert for southeastern Alaska appears as affecting Anchorage.

## Current System Behavior

### Ingestion Process (backend/src/ingestion/noaa-ingestor.js)
1. Fetches alerts from NOAA API filtered by affected zones
2. Uses `external_id` (NOAA's alert URN) as unique identifier
3. For each alert, calls `AdvisoryModel.upsert()`
4. Upsert logic: `ON DUPLICATE KEY UPDATE` based on `external_id`

### Why Duplicates Persist
```javascript
// backend/src/models/advisory.js - Line ~45
const query = `
  INSERT INTO advisories (external_id, site_id, advisory_type, ...)
  VALUES (?, ?, ?, ...)
  ON DUPLICATE KEY UPDATE
    advisory_type = VALUES(advisory_type),
    ...
`;
```

**Issue**: Each NOAA update has a DIFFERENT `external_id`, so it's not recognized as a duplicate. The system correctly prevents duplicate `external_id` values but doesn't recognize that multiple `external_id` values represent updates to the SAME weather event.

## Technical Details

### NOAA Alert Lifecycle
1. **Initial Alert**: `messageType: "Alert"` - New weather event
2. **Update**: `messageType: "Update"` - Conditions changed, new external_id issued
3. **Continuation**: `messageType: "Update"` - Event continues, references previous
4. **Cancellation**: `messageType: "Cancel"` - Event ended early

### VTEC Code (Event Tracking)
NOAA includes VTEC (Valid Time Event Code) in alerts:
```
/O.CON.PAJK.WS.W.0005.000000T0000Z-260213T0000Z/
```
- `O.CON` = Continues
- `PAJK` = NWS Juneau
- `WS.W` = Winter Storm Warning
- `0005` = **Event Number** (unique for this winter storm)

**This is the key to deduplication**: VTEC event numbers stay consistent across updates.

## Impact Assessment

### User Experience Impact
- **Dashboard Clutter**: Users see 7 "Winter Weather Advisory" entries when there's really 1-2 distinct events
- **Alert Fatigue**: Overwhelming number of alerts reduces attention to critical warnings
- **Confusion**: Multiple similar-sounding alerts with different timestamps confuse operations teams
- **Inefficient Review**: IMT/Ops must manually review 30 alerts instead of ~10

### System Performance Impact
- **Database Growth**: 3x more advisory records than necessary
- **API Response Size**: Larger payloads slow down frontend
- **Query Performance**: More rows to filter and process
- **Storage Costs**: Unnecessary duplication of large JSON payloads

## Recommended Solutions

### Option 1: VTEC-Based Deduplication (RECOMMENDED)
**Approach**: Use VTEC code as the primary deduplication key instead of `external_id`.

**Implementation**:
1. Extract VTEC from `raw_payload.properties.parameters.VTEC`
2. Create composite key: `(site_id, vtec_code, advisory_type)`
3. Update upsert logic to match on VTEC instead of external_id
4. Keep `external_id` in database for reference/debugging

**Pros**:
- ✅ Correctly handles NOAA update lifecycle
- ✅ Reduces duplicates by ~60-70%
- ✅ Standards-compliant with NOAA methodology
- ✅ Minimal database schema changes

**Cons**:
- ⚠️ Requires parsing VTEC from JSON
- ⚠️ Not all alerts have VTEC (marine forecasts use different codes)

**Effort**: Medium (2-3 days implementation + testing)

### Option 2: Reference Chain Processing
**Approach**: Process `references` field to identify and consolidate alert updates.

**Implementation**:
1. When ingesting an alert, check if `properties.references` exists
2. Look up referenced `external_id` in database
3. If found, UPDATE that record instead of creating new one
4. Keep history of external_ids in separate `alert_updates` table

**Pros**:
- ✅ Uses NOAA's built-in update mechanism
- ✅ Preserves full audit trail
- ✅ Works for all alert types

**Cons**:
- ⚠️ More complex logic (recursive reference chains)
- ⚠️ Requires additional database table
- ⚠️ Some alerts don't have proper references

**Effort**: High (4-5 days implementation + testing)

### Option 3: Time-Window Deduplication
**Approach**: Consider alerts as duplicates if they match on type, site, and severity within a time window.

**Implementation**:
1. When inserting alert, check for existing alerts with:
   - Same `site_id`
   - Same `advisory_type`
   - Same `severity`
   - `issued_time` within 24 hours
2. If match found, update existing instead of insert

**Pros**:
- ✅ Simple to implement
- ✅ No VTEC parsing required
- ✅ Works for all alert types

**Cons**:
- ❌ May incorrectly merge distinct events
- ❌ Doesn't handle legitimately separate events of same type
- ❌ Fragile - depends on timing assumptions

**Effort**: Low (1-2 days) but **NOT RECOMMENDED** due to accuracy concerns

### Option 4: Geographic Zone Refinement
**Approach**: Improve site-to-zone mapping to reduce false positives.

**Implementation**:
1. Review site 2703 geocoding - verify it shouldn't match zones 170+ miles away
2. Implement distance-based zone filtering
3. Only match zones within X miles of site location
4. Requires zone boundary data or distance calculations

**Pros**:
- ✅ Reduces non-applicable alerts
- ✅ Improves overall accuracy
- ✅ Benefits all sites, not just 2703

**Cons**:
- ❌ Doesn't solve update duplication
- ⚠️ Complex - requires geographic boundary data
- ⚠️ May miss legitimate regional alerts

**Effort**: High (5-7 days) - **Should be done in addition to, not instead of, update handling**

## Recommendation

**Implement Option 1 (VTEC-Based Deduplication) immediately** to address the update duplication problem, which accounts for ~60-70% of the duplicate alerts.

**Follow up with Option 4 (Geographic Zone Refinement)** in a future sprint to further improve accuracy and reduce false positive alerts for all sites.

## Next Steps

1. **Review this analysis** with the team
2. **Approve recommended solution** (Option 1)
3. **Create implementation plan** with:
   - Database schema updates (add vtec_code column)
   - Normalizer changes (extract VTEC)
   - Advisory model updates (change upsert key)
   - Migration script (backfill VTEC for existing alerts)
   - Testing plan (verify deduplication logic)
4. **Schedule deployment** after thorough testing

## Additional Notes

- This issue affects **all Alaska sites** more severely due to geographic size and multiple overlapping forecast zones
- Lower-48 sites likely have 2-3x duplicates, not 7x like Alaska
- Marine alerts (Storm Warning, Gale Warning) have different event codes and may need special handling
- Consider adding "View History" feature to show users the alert update timeline
