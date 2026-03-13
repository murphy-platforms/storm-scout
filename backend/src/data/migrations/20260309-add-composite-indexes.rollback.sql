-- Rollback: Remove composite indexes added in 20260309-add-composite-indexes.sql

DROP INDEX idx_advisories_office_severity       ON advisories;
DROP INDEX idx_advisories_office_status_endtime  ON advisories;
DROP INDEX idx_advisories_vtec_office_status     ON advisories;
DROP INDEX idx_advisories_status_updated         ON advisories;
