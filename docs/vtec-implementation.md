# VTEC Event ID Deduplication Implementation

Documentation of the VTEC (Valid Time Event Code) based deduplication system implemented in Storm Scout.

## Problem Statement

NOAA weather alerts were appearing as duplicates in the system when they were updated with different action codes (NEW → CON → EXT) despite representing the same underlying weather event. This created confusion for IMT and Operations teams trying to understand the current threat landscape.

### Example of the Problem

For site 219 (Anchorage, AK - site code 2703):
- Same blizzard warning appeared 3 times with different VTEC codes:
  - `/O.NEW.PAJK.BZ.W.0006.260213T1000Z-260214T0200Z/` (initial alert)
  - `/O.CON.PAJK.BZ.W.0006.260213T1000Z-260214T0200Z/` (continued alert)
  - `/O.EXT.PAJK.BZ.W.0006.260213T1000Z-260215T0200Z/` (extended alert)

The system was treating these as 3 separate advisories when they should be displayed as 1 event with status updates.

## Solution: VTEC Event ID Extraction

### What is VTEC?

VTEC (Valid Time Event Code) is NOAA's standardized format for weather alert lifecycle management.

**Format**: `/O.ACTION.OFFICE.PHENOMENA.SIGNIFICANCE.EVENT_NUM.BEGIN_TIME-END_TIME/`

**Example**: `/O.NEW.PAJK.BZ.W.0006.260213T1000Z-260214T0200Z/`

**Components**:
- **O**: Operational (always 'O' for operational products)
- **ACTION**: NEW, CON, EXT, EXP, CAN, UPG, COR, etc.
- **OFFICE**: 4-letter NWS office code (e.g., PAJK = Juneau, Alaska)
- **PHENOMENA**: 2-letter hazard type (BZ = Blizzard)
- **SIGNIFICANCE**: Single letter (W = Warning, A = Advisory, Y = Watch)
- **EVENT_NUM**: 4-digit sequential event number (e.g., 0006)
- **BEGIN_TIME**: ISO timestamp when event becomes effective
- **END_TIME**: ISO timestamp when event expires

### Persistent Event Identifier

The **Event ID** is the combination that uniquely identifies a weather event across its entire lifecycle:

**Format**: `OFFICE.PHENOMENA.SIGNIFICANCE.EVENT_NUM`

**Example**: `PAJK.BZ.W.0006`

This identifier:
- Remains constant as the event progresses (NEW → CON → EXT)
- Is unique within a weather forecast office's jurisdiction
- Allows tracking an event from issuance to expiration

## Implementation

### Database Schema Changes

Added two new columns to the `advisories` table:

```sql
ALTER TABLE advisories 
ADD COLUMN vtec_event_id VARCHAR(50) DEFAULT NULL,
ADD COLUMN vtec_action VARCHAR(10) DEFAULT NULL;
```

**Generated Column for Unique Constraint**:
```sql
ALTER TABLE advisories 
ADD COLUMN vtec_event_unique_key VARCHAR(100) GENERATED ALWAYS AS (
    CASE 
        WHEN vtec_event_id IS NOT NULL 
        THEN CONCAT(site_id, ':', vtec_event_id)
        ELSE CONCAT('no_vtec:', id)
    END
) STORED;

CREATE UNIQUE INDEX vtec_event_unique_key ON advisories(vtec_event_unique_key);
```

This approach:
- Deduplicates VTEC alerts by event ID
- Allows non-VTEC alerts (e.g., local notices) to coexist
- Uses MySQL generated columns for automatic maintenance

### Code Changes

#### normalizer.js

Added extraction functions in `backend/src/ingestion/utils/normalizer.js`:

```javascript
/**
 * Extract persistent VTEC event ID from VTEC code
 * Format: OFFICE.PHENOMENA.SIGNIFICANCE.EVENT_NUM
 * Example: /O.NEW.PAJK.BZ.W.0006... → PAJK.BZ.W.0006
 */
function extractVTECEventID(vtecString) {
    if (!vtecString || typeof vtecString !== 'string') {
        return null;
    }
    
    const vtecMatch = vtecString.match(/\/O\.[A-Z]{3}\.([A-Z]{4})\.([A-Z]{2})\.([A-Z])\.(\d{4})\./);
    if (!vtecMatch) {
        return null;
    }
    
    const [, office, phenomena, significance, eventNum] = vtecMatch;
    return `${office}.${phenomena}.${significance}.${eventNum}`;
}

/**
 * Extract VTEC action code
 * Example: /O.NEW.PAJK... → NEW
 */
function extractVTECAction(vtecString) {
    if (!vtecString || typeof vtecString !== 'string') {
        return null;
    }
    
    const actionMatch = vtecString.match(/\/O\.([A-Z]{3})\./);
    return actionMatch ? actionMatch[1] : null;
}
```

#### advisory.js Model

Updated `backend/src/models/advisory.js` to use event ID for deduplication:

```javascript
/**
 * Find advisory by VTEC Event ID and Site ID
 */
static async findByVTECEventID(vtecEventId, siteId) {
    const query = `
        SELECT * FROM advisories 
        WHERE vtec_event_id = ? AND site_id = ?
        LIMIT 1
    `;
    const [rows] = await db.query(query, [vtecEventId, siteId]);
    return rows[0] || null;
}

/**
 * Create or update advisory (UPSERT logic)
 */
static async createOrUpdate(advisoryData) {
    const db = getDatabase();
    
    // If VTEC event ID exists, check for existing advisory
    let existingAdvisory = null;
    if (advisoryData.vtec_event_id) {
        existingAdvisory = await this.findByVTECEventID(
            advisoryData.vtec_event_id, 
            advisoryData.site_id
        );
    }
    
    if (existingAdvisory) {
        // Update existing advisory
        return await this.update(existingAdvisory.id, advisoryData);
    } else {
        // Create new advisory
        return await this.create(advisoryData);
    }
}
```

### Action Codes

The `vtec_action` field captures the lifecycle status for IMT/Operations visibility:

| Code | Meaning | Description |
|------|---------|-------------|
| **NEW** | New | Alert initially issued |
| **CON** | Continued | Alert ongoing, no changes |
| **EXT** | Extended | Time period extended |
| **EXA** | Extended (Area) | Geographic area extended |
| **EXB** | Extended (Both) | Time and area extended |
| **UPG** | Upgraded | Severity increased |
| **EXP** | Expired | Alert expired |
| **CAN** | Cancelled | Alert cancelled |
| **COR** | Corrected | Correction issued |
| **ROU** | Routine | Routine update |

### Frontend Display

Action codes are displayed as color-coded badges in `frontend/advisories.html`:

- 🆕 **NEW** (green): New alert issued
- 🔄 **CONTINUED** (blue): Alert ongoing
- ⏱️ **EXTENDED** (cyan): Time extended
- ⚠️ **UPGRADED** (yellow): Severity increased
- ✏️ **CORRECTED** (yellow): Correction issued
- ❌ **EXPIRED** (gray): Alert expired
- 🚫 **CANCELLED** (dark): Alert cancelled

## Deployment Process

### Migration Steps

1. **Add Columns**:
   ```sql
   ALTER TABLE advisories 
   ADD COLUMN vtec_event_id VARCHAR(50) DEFAULT NULL,
   ADD COLUMN vtec_action VARCHAR(10) DEFAULT NULL;
   ```

2. **Backfill Existing Data**:
   ```bash
   node backend/scripts/backfill-vtec-event-id.js
   ```

3. **Remove Duplicates**:
   ```bash
   node backend/scripts/cleanup-event-id-duplicates.js
   ```

4. **Add Unique Constraint**:
   ```sql
   ALTER TABLE advisories 
   ADD COLUMN vtec_event_unique_key VARCHAR(100) GENERATED ALWAYS AS (
       CASE 
           WHEN vtec_event_id IS NOT NULL 
           THEN CONCAT(site_id, ':', vtec_event_id)
           ELSE CONCAT('no_vtec:', id)
       END
   ) STORED;
   
   CREATE UNIQUE INDEX vtec_event_unique_key ON advisories(vtec_event_unique_key);
   ```

5. **Add Indexes for Performance**:
   ```sql
   ALTER TABLE advisories ADD INDEX idx_vtec_event_id (vtec_event_id);
   ALTER TABLE advisories ADD INDEX idx_vtec_action (vtec_action);
   ```

### Deployment Results

**Production Deployment**: February 12, 2026 (21:27-22:10 UTC)

**Before**:
- Site 219 (Anchorage): ~30 alerts displayed
- ~19 unique VTEC events among them
- ~11 duplicates just for this site

**After**:
- Site 219: 25 unique alerts
- Zero event ID duplicates across entire system
- 74 alerts have VTEC action codes captured
- ~40 duplicates eliminated system-wide

**Action Code Distribution** (Post-Deployment):
- CON (Continued): 33 alerts
- NEW (New): 30 alerts
- EXT (Extended): 8 alerts
- EXB (Extended Both): 2 alerts
- COR (Corrected): 1 alert

## Testing & Verification

### Verify Deduplication

```bash
# Check for event ID duplicates
ssh stormscout
mysql -u storm_scout -p storm_scout

SELECT vtec_event_id, site_id, COUNT(*) as count
FROM advisories 
WHERE vtec_event_id IS NOT NULL
GROUP BY vtec_event_id, site_id
HAVING count > 1;

# Should return 0 rows
```

### Check Action Codes

```sql
SELECT vtec_action, COUNT(*) as count 
FROM advisories 
WHERE vtec_action IS NOT NULL
GROUP BY vtec_action
ORDER BY count DESC;
```

### Verify Frontend Display

1. Navigate to https://your-domain.example.com/advisories.html
2. Check "Action" column displays badges
3. Hover over badges to see tooltips
4. Verify no duplicate entries for same event

## Benefits

### For IMT/Operations Teams

1. **Clear Event Tracking**: See when alerts are new, continuing, or extended
2. **Accurate Counts**: Site advisory counts reflect unique events, not status updates
3. **Decision Support**: Understand alert lifecycle for better go/no-go decisions
4. **Reduced Confusion**: No more duplicate entries for the same weather event

### Technical Benefits

1. **Data Integrity**: Unique constraints prevent duplicates at database level
2. **Efficient Queries**: Indexed event IDs improve query performance
3. **NOAA Alignment**: Follows NOAA's intended event lifecycle model
4. **Maintainability**: Generated columns automatically maintain constraints
5. **Non-VTEC Support**: System still handles alerts without VTEC codes

## Edge Cases

### Non-VTEC Alerts

Some alerts don't have VTEC codes (e.g., Special Weather Statements). These:
- Have `vtec_event_id = NULL`
- Use the fallback `no_vtec:<id>` for unique constraint
- Are not deduplicated (each is unique)

### Event ID Collisions

VTEC event numbers are sequential within each NWS office. Event IDs are unique because they include:
- Office code (4 letters)
- Phenomena (2 letters)
- Significance (1 letter)
- Event number (4 digits)

Example: `PAJK.BZ.W.0006` is different from `PAFC.BZ.W.0006` (different offices)

### Action Code Updates

When NOAA updates an alert (e.g., NEW → CON):
- Same event ID maintained
- Database UPDATE instead of INSERT
- Action code updated to latest value
- Frontend shows current action status

## Future Enhancements

1. **Action History**: Track all action codes for an event over time
2. **Alert Timeline**: Show event lifecycle in UI (NEW → CON → EXT → EXP)
3. **Notification Preferences**: Alert on specific actions (e.g., only NEW and UPG)
4. **Analytics**: Report on event durations, extension frequency, etc.

## Related Files

- `backend/src/ingestion/utils/normalizer.js` - VTEC extraction logic
- `backend/src/models/advisory.js` - Deduplication logic
- `frontend/advisories.html` - Action badge display
- `backend/scripts/backfill-vtec-event-id.js` - Migration script
- `backend/scripts/cleanup-event-id-duplicates.js` - Cleanup script

## Documentation References

- [NOAA VTEC Documentation](https://www.weather.gov/help-vtec)
- [Deployment Guide](./deployment.md)
- [API Documentation](./api.md)
- [Database Schema](./database-schema.md)

---

**Implemented**: February 12-13, 2026  
**Status**: Production Ready  
**Impact**: Eliminated ~40 duplicate alerts system-wide
