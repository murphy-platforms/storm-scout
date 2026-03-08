-- Rollback: Remove VTEC Event ID and Action Columns
-- Date: 2026-02-12

-- Drop indexes
DROP INDEX idx_vtec_action ON advisories;
DROP INDEX idx_vtec_event_id ON advisories;
DROP INDEX idx_vtec_event_unique_active ON advisories;

-- Drop generated column
ALTER TABLE advisories DROP COLUMN vtec_event_unique_key;

-- Drop new columns
ALTER TABLE advisories DROP COLUMN vtec_action;
ALTER TABLE advisories DROP COLUMN vtec_event_id;

-- Restore old uniqueness constraint (optional - only if you want to go back to the old system)
-- ALTER TABLE advisories 
-- ADD COLUMN vtec_unique_key VARCHAR(600) 
-- GENERATED ALWAYS AS (
--   CASE 
--     WHEN status = 'active' AND vtec_code IS NOT NULL 
--     THEN CONCAT(vtec_code, '|', site_id, '|', advisory_type)
--     ELSE NULL
--   END
-- ) STORED;
--
-- CREATE UNIQUE INDEX idx_vtec_unique_active ON advisories (vtec_unique_key);
