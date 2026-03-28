-- Add station_name column to store human-readable observation station names.
-- Populated by map-observation-stations.js --backfill-names after migration.

ALTER TABLE offices ADD COLUMN station_name VARCHAR(100) AFTER observation_station;
