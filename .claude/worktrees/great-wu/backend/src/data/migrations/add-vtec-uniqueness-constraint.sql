-- Migration: Add VTEC Uniqueness Constraint
-- Purpose: Prevent duplicate active alerts with same VTEC code at database level
-- Date: 2026-02-12

-- MySQL/MariaDB doesn't support partial indexes (WHERE status = 'active')
-- Solution: Use a generated column that combines VTEC+site+type+status
-- and create a unique index on it, with NULL for expired/NULL VTEC

-- Step 1: Add a generated column for uniqueness checking
-- This column will be:
--   - CONCAT(vtec_code, '|', site_id, '|', advisory_type) when status = 'active' and vtec_code IS NOT NULL
--   - NULL otherwise (allows unlimited expired or NULL VTEC alerts)

ALTER TABLE advisories 
ADD COLUMN vtec_unique_key VARCHAR(600) 
GENERATED ALWAYS AS (
  CASE 
    WHEN status = 'active' AND vtec_code IS NOT NULL 
    THEN CONCAT(vtec_code, '|', site_id, '|', advisory_type)
    ELSE NULL
  END
) STORED;

-- Step 2: Create a unique index on the generated column
-- NULL values are ignored by unique indexes, so this allows:
--   - Multiple expired alerts (status != 'active')
--   - Multiple alerts without VTEC codes (vtec_code IS NULL)
--   - Only ONE active alert per (vtec_code, site_id, advisory_type) combination

CREATE UNIQUE INDEX idx_vtec_unique_active 
ON advisories (vtec_unique_key);

-- Verification query (run after migration)
-- SELECT 
--   COUNT(*) as total_active,
--   COUNT(DISTINCT vtec_unique_key) as unique_vtec_keys,
--   COUNT(vtec_unique_key) as non_null_keys
-- FROM advisories 
-- WHERE status = 'active';
