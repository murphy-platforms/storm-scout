-- Rollback: Global Alert Sources Migration
-- [DB-1] Corrected for MariaDB compatibility (no self-referential subqueries)
-- Run on test DB first. Only use on production if rollback is needed.

-- Step 1: Remove CA sites FIRST (while country_code column still exists)
-- CASCADE will handle related advisories/status rows if FK constraints exist
DELETE FROM sites WHERE country_code = 'CA';

-- Step 2: Drop new columns (order matters — delete data before dropping columns)
ALTER TABLE advisories DROP COLUMN alert_source;
ALTER TABLE sites DROP COLUMN geo_codes;
ALTER TABLE sites DROP COLUMN timezone;
ALTER TABLE sites DROP COLUMN province;
ALTER TABLE sites DROP COLUMN country_code;

-- Step 3: Drop new indexes (if not auto-dropped with columns)
DROP INDEX IF EXISTS idx_sites_country_state ON sites;
DROP INDEX IF EXISTS idx_advisories_source ON advisories;
