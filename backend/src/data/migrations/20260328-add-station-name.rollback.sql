-- Rollback: Remove station_name column added in 20260328-add-station-name.sql
ALTER TABLE offices DROP COLUMN station_name;
