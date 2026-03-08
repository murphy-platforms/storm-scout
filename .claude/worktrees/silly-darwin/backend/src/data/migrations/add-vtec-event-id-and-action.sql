-- Migration: Add VTEC Event ID and Action Columns
-- Purpose: Extract persistent event ID and action code for better deduplication and UX
-- Date: 2026-02-12

-- Step 1: Add vtec_event_id column (persistent identifier across alert updates)
-- Format: OFFICE.PHENOMENA.SIGNIFICANCE.EVENT_NUM (e.g., "PAJK.HW.W.0006")
-- This stays the same when NOAA issues updates (NEW→CON→EXT→EXP)
ALTER TABLE advisories 
ADD COLUMN vtec_event_id VARCHAR(50) AFTER vtec_code;

-- Step 2: Add vtec_action column (for display to operations/IMT)
-- Values: NEW, CON, EXT, EXP, CAN, UPG, EXA, EXB, ROU, COR
-- This tells users whether an alert is new, continuing, extended, etc.
ALTER TABLE advisories 
ADD COLUMN vtec_action VARCHAR(10) AFTER vtec_event_id;

-- Step 3: Drop old vtec_unique_key constraint (was based on full VTEC)
-- We'll replace it with one based on event ID
DROP INDEX idx_vtec_unique_active ON advisories;
ALTER TABLE advisories DROP COLUMN vtec_unique_key;

-- Step 4: Create new generated column for uniqueness based on event ID
-- This column will be:
--   - CONCAT(vtec_event_id, '|', site_id, '|', advisory_type) when status = 'active' and vtec_event_id IS NOT NULL
--   - NULL otherwise (allows unlimited expired or NULL VTEC alerts)
ALTER TABLE advisories 
ADD COLUMN vtec_event_unique_key VARCHAR(600) 
GENERATED ALWAYS AS (
  CASE 
    WHEN status = 'active' AND vtec_event_id IS NOT NULL 
    THEN CONCAT(vtec_event_id, '|', site_id, '|', advisory_type)
    ELSE NULL
  END
) STORED;

-- Step 5: Create unique index on the new generated column
-- This ensures only ONE active alert per (vtec_event_id, site_id, advisory_type)
-- NULL values are ignored, so expired alerts and non-VTEC alerts don't conflict
CREATE UNIQUE INDEX idx_vtec_event_unique_active 
ON advisories (vtec_event_unique_key);

-- Step 6: Add index on vtec_event_id for faster lookups
CREATE INDEX idx_vtec_event_id ON advisories (vtec_event_id);

-- Step 7: Add index on vtec_action for filtering/reporting
CREATE INDEX idx_vtec_action ON advisories (vtec_action);

-- Verification queries (run after migration):
-- SELECT COUNT(*) as total, 
--        COUNT(vtec_event_id) as with_event_id,
--        COUNT(DISTINCT vtec_action) as unique_actions
-- FROM advisories WHERE status = 'active';
--
-- SELECT vtec_action, COUNT(*) as count 
-- FROM advisories 
-- WHERE status = 'active' AND vtec_action IS NOT NULL
-- GROUP BY vtec_action;
