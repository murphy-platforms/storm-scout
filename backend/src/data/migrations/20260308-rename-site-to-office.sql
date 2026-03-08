-- Migration: 20260308-rename-site-to-office
-- Renames all "site" tables, columns, and indexes to "office" terminology
-- Run once against an existing database; safe to skip on fresh installs
-- (fresh installs use schema.sql which already uses office terminology)

-- ============================================================
-- STEP 1: Drop generated column before altering its dependencies
-- The vtec_event_unique_key column references site_id; it must be
-- dropped and recreated after site_id is renamed to office_id.
-- ============================================================
ALTER TABLE advisories DROP INDEX idx_vtec_event_unique_active;
ALTER TABLE advisories DROP COLUMN vtec_event_unique_key;

-- ============================================================
-- STEP 2: Rename tables
-- ============================================================
RENAME TABLE sites TO offices;
RENAME TABLE site_status TO office_status;
RENAME TABLE site_observations TO office_observations;

-- ============================================================
-- STEP 3: Rename site_code → office_code in offices table
-- ============================================================
ALTER TABLE offices CHANGE site_code office_code VARCHAR(10) NOT NULL;

-- ============================================================
-- STEP 4: Rename site_id → office_id in all dependent tables
-- Drop foreign keys first (required by MariaDB before column rename)
-- ============================================================

-- advisories
ALTER TABLE advisories DROP FOREIGN KEY advisories_ibfk_1;
ALTER TABLE advisories DROP INDEX idx_advisories_external_site;
ALTER TABLE advisories DROP INDEX idx_advisories_site;
ALTER TABLE advisories DROP INDEX idx_advisories_site_status;
ALTER TABLE advisories CHANGE site_id office_id INT NOT NULL;
ALTER TABLE advisories ADD CONSTRAINT advisories_offices_fk
    FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE CASCADE;
ALTER TABLE advisories ADD UNIQUE INDEX idx_advisories_external_office (external_id, office_id);
CREATE INDEX idx_advisories_office ON advisories(office_id);
CREATE INDEX idx_advisories_office_status ON advisories(office_id, status);

-- office_status (was site_status)
ALTER TABLE office_status DROP FOREIGN KEY site_status_ibfk_1;
ALTER TABLE office_status CHANGE site_id office_id INT NOT NULL;
ALTER TABLE office_status ADD CONSTRAINT office_status_offices_fk
    FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE CASCADE;

-- advisory_history
ALTER TABLE advisory_history DROP FOREIGN KEY advisory_history_ibfk_1;
ALTER TABLE advisory_history DROP INDEX idx_advisory_history_site;
ALTER TABLE advisory_history DROP INDEX idx_advisory_history_site_time;
ALTER TABLE advisory_history CHANGE site_id office_id INT NOT NULL;
ALTER TABLE advisory_history ADD CONSTRAINT advisory_history_offices_fk
    FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE CASCADE;
CREATE INDEX idx_advisory_history_office ON advisory_history(office_id);
CREATE INDEX idx_advisory_history_office_time ON advisory_history(office_id, snapshot_time);

-- office_observations (was site_observations)
ALTER TABLE office_observations DROP FOREIGN KEY site_observations_ibfk_1;
ALTER TABLE office_observations DROP INDEX idx_site_observations_site;
ALTER TABLE office_observations DROP INDEX idx_site_observations_station;
ALTER TABLE office_observations CHANGE site_id office_id INT NOT NULL;
ALTER TABLE office_observations ADD CONSTRAINT office_observations_offices_fk
    FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE CASCADE;
ALTER TABLE office_observations ADD UNIQUE INDEX idx_office_observations_office (office_id);
CREATE INDEX idx_office_observations_station ON office_observations(station_id);

-- ============================================================
-- STEP 5: Rename indexes on offices table
-- ============================================================
ALTER TABLE offices DROP INDEX idx_sites_state;
ALTER TABLE offices DROP INDEX idx_sites_region;
ALTER TABLE offices DROP INDEX idx_sites_coords;
ALTER TABLE offices DROP INDEX idx_sites_county;
CREATE INDEX idx_offices_state ON offices(state);
CREATE INDEX idx_offices_region ON offices(region);
CREATE INDEX idx_offices_coords ON offices(latitude, longitude);
CREATE INDEX idx_offices_county ON offices(county);

-- ============================================================
-- STEP 6: Rename indexes on office_status table
-- ============================================================
ALTER TABLE office_status DROP INDEX idx_site_status_status;
ALTER TABLE office_status DROP INDEX idx_site_status_weather;
CREATE INDEX idx_office_status_status ON office_status(operational_status);
CREATE INDEX idx_office_status_weather ON office_status(weather_impact_level);

-- ============================================================
-- STEP 7: Recreate the generated vtec_event_unique_key column
-- using the renamed office_id column
-- ============================================================
ALTER TABLE advisories ADD COLUMN vtec_event_unique_key VARCHAR(600)
    GENERATED ALWAYS AS (
        CASE
            WHEN status = 'active' AND vtec_event_id IS NOT NULL
            THEN CONCAT(vtec_event_id, '|', office_id, '|', advisory_type)
            ELSE NULL
        END
    ) STORED;
ALTER TABLE advisories ADD UNIQUE INDEX idx_vtec_event_unique_active (vtec_event_unique_key);
