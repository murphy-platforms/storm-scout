-- Storm Scout Seed Data
-- MySQL/MariaDB compatible

-- NOTE: Office data is loaded via import-offices.js + init-db, not seeded here.
-- To load 300 locations:
--   1. node src/scripts/import-offices.js /path/to/locations.csv
--   2. npm run init-db   (loads offices.json into database)
-- The advisory/status inserts below are optional sample data for development only.

-- Government/local notices are populated by the ingestion pipeline only.
-- No sample notices are seeded here — seed data would appear as real
-- emergency declarations on notices.html (see issue #76).
-- To remove any previously seeded notices, run:
--   migration: 20260309-remove-seed-notices.sql

-- Set default operational status for all loaded offices
INSERT IGNORE INTO office_status (office_id, operational_status, reason)
SELECT id, 'open_normal', 'No active advisories' FROM offices
WHERE id NOT IN (SELECT office_id FROM office_status);
