-- Migration: Fix external_id unique constraint
-- Date: 2026-02-22
-- Issue: #57 - Sites missing NOAA alerts due to UNIQUE constraint on external_id
--
-- Problem: The advisories table has a table-wide UNIQUE on external_id (without site_id).
-- When one NOAA alert matches multiple sites via UGC codes, only the first site gets the row.
-- All other matching sites silently lose their alerts.
--
-- Fix: Change to composite UNIQUE(external_id, site_id) so the same NOAA alert
-- can exist once per site.

-- Step 1: Drop the two redundant single-column unique indexes
ALTER TABLE advisories DROP INDEX idx_advisories_external_id;
ALTER TABLE advisories DROP INDEX idx_external_id_unique;

-- Step 2: Add composite unique index (external_id + site_id)
ALTER TABLE advisories ADD UNIQUE INDEX idx_advisories_external_site (external_id, site_id);

-- Step 3: Verify
-- SHOW INDEX FROM advisories WHERE Key_name = 'idx_advisories_external_site';

-- ============================================================
-- ROLLBACK (if needed):
-- ALTER TABLE advisories DROP INDEX idx_advisories_external_site;
-- ALTER TABLE advisories ADD UNIQUE INDEX idx_advisories_external_id (external_id);
-- ============================================================
