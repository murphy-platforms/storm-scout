# VTEC Duplication Issue - Analysis and Fix

**Date**: February 12, 2026  
**Issue**: Duplicate alerts with same event number but different VTEC actions

## Problem Identified

The current VTEC deduplication system uses the **full VTEC string** as the unique key, but NOAA changes parts of the VTEC string when issuing updates:

### Example: High Wind Warning Event 0006
```
Alert 1: /O.NEW.PAJK.HW.W.0006.260212T1200Z-260213T0300Z/  (NEW - issued)
Alert 2: /O.CON.PAJK.HW.W.0006.260212T1200Z-260213T0300Z/  (CON - continued)
Alert 3: /O.CON.PAJK.HW.W.0006.000000T0000Z-260213T0300Z/  (CON - updated timestamps)
```

All three are THE SAME WEATHER EVENT (0006), but our system treats them as different because:
- Action code changes: NEW → CON
- Start timestamps change: `260212T1200Z` → `000000T0000Z` (means "already in effect")

## VTEC Format Breakdown

VTEC format: `/O.{ACTION}.{OFFICE}.{PHENOMENA}.{SIGNIFICANCE}.{EVENT_NUM}.{START}-{END}/`

Example: `/O.CON.PAJK.HW.W.0006.260212T1200Z-260213T0300Z/`
- `O` = Operational
- `CON` = **Action** (CONtinue, NEW, EXT, EXP, CAN, UPG, etc.)
- `PAJK` = **Office** (Juneau, Alaska)
- `HW` = **Phenomena** (High Wind)
- `W` = **Significance** (Warning)
- `0006` = **Event Number** (THIS IS THE PERSISTENT ID!)
- `260212T1200Z-260213T0300Z` = **Time range** (can change in updates)

## What Should Be Unique

For a given site, the unique combination should be:
- **Office code** (PAJK, PAFG, PAFC)
- **Phenomena** (HW, WS, BZ, etc.)
- **Significance** (W, Y, A)
- **Event number** (0006, 0005, etc.)

The ACTION and TIMESTAMPS can change for the same event!

## Current Duplicates in Production

### Site 219 (Anchorage, AK)
Found multiple duplicate groups:

1. **High Wind Warning 0006** - 3 duplicates
   - ID 3199: NEW action
   - ID 14016: CON action (one timestamp)
   - ID 23202: CON action (different timestamp)

2. **Wind Advisory 0011** - 3 duplicates
   - ID 3200: NEW action
   - ID 14015: CON action (one timestamp)
   - ID 23204: CON action (different timestamp)

3. **Winter Storm Warning 0005** - 3 duplicates
   - ID 3205: NEW action
   - ID 13445: CON action (one timestamp)
   - ID 27672: CON action (different timestamp)

4. **Winter Weather Advisory 0009** - 2 duplicates
   - ID 13446: CON action (one timestamp)
   - ID 27671: CON action (different timestamp)

### Site 188 (Casper, WY)
No VTEC duplicates found (all have count=1)

### Site 119 (Grand Junction, CO)
No VTEC duplicates found (all have count=1)

## Root Cause

The current system extracts the FULL VTEC string:
```javascript
vtec_code = "/O.CON.PAJK.HW.W.0006.260212T1200Z-260213T0300Z/"
```

But it should extract the **persistent event identifier**:
```javascript
vtec_event_id = "PAJK.HW.W.0006"  // Office.Phenomena.Significance.EventNum
```

## Proposed Solution

### Option 1: Parse VTEC to Extract Event ID (Recommended)
Modify `extractVTEC()` to return the persistent part:

```javascript
function extractVTECEventID(noaaAlert) {
  const vtec = extractVTEC(noaaAlert);  // Get full VTEC
  if (!vtec) return null;
  
  // Parse: /O.{ACTION}.{OFFICE}.{PHENOM}.{SIG}.{EVENT}.{TIMES}/
  const match = vtec.match(/\/O\.\w+\.(\w+)\.(\w+)\.(\w)\.(\d+)\./);
  if (!match) return null;
  
  const [, office, phenomena, significance, eventNum] = match;
  return `${office}.${phenomena}.${significance}.${eventNum}`;
}
```

**Result**: `PAJK.HW.W.0006` (same for all updates to event 0006)

### Option 2: Store Full VTEC but Deduplicate on Event ID
Keep storing full VTEC (for reference) but add a separate `vtec_event_id` column for deduplication.

### Option 3: Ignore Action Codes in Deduplication
Less precise, but simpler: Just strip the action code before comparing.

## Recommended Approach

**Option 1** - Extract the persistent event identifier and use that for deduplication.

**Implementation Steps**:
1. Add `vtec_event_id` column to database (alongside existing `vtec_code`)
2. Update `extractVTEC()` to also extract event ID
3. Update unique constraint to use `vtec_event_id` instead of full `vtec_code`
4. Backfill existing alerts with event IDs
5. Run cleanup to remove current duplicates
6. Keep `vtec_code` for reference/debugging

**Benefits**:
- Properly handles all VTEC update scenarios (NEW, CON, EXT, EXP, etc.)
- Matches NOAA's actual event tracking
- More accurate deduplication
- Keeps full VTEC for debugging

## Impact Assessment

**Current Duplicates**: ~12-15 duplicate alerts across 3 sites  
**Sites Affected**: Primarily Alaska sites (219/2703) due to high NOAA activity  
**User Impact**: Moderate - users see 2-3x more alerts than actual events

## Next Steps

1. Confirm approach with stakeholder
2. Implement VTEC event ID extraction
3. Create database migration
4. Backfill and cleanup existing data
5. Monitor for 48 hours to ensure proper deduplication
