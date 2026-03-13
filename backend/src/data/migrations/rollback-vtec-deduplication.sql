-- Rollback: Remove VTEC-based deduplication support
-- Date: 2026-02-12
-- Purpose: Rollback add-vtec-deduplication.sql migration if needed
--
-- IMPORTANT: This rollback is safe because:
-- 1. Dropping vtec_code column only removes deduplication logic
-- 2. external_id remains as the primary unique key
-- 3. No data is lost - only the deduplication optimization is removed

-- Drop indexes first (must drop indexes before dropping column)
DROP INDEX IF EXISTS idx_status_vtec ON advisories;
DROP INDEX IF EXISTS idx_vtec_code ON advisories;
DROP INDEX IF EXISTS idx_vtec_site_type ON advisories;

-- Drop vtec_code column
ALTER TABLE advisories DROP COLUMN IF EXISTS vtec_code;

-- Restore original table comment
ALTER TABLE advisories COMMENT = 'Weather advisories from NOAA';
