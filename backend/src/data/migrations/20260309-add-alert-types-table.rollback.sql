-- Rollback: Remove alert_types table added in 20260309-add-alert-types-table.sql
-- No FK constraint was added (MariaDB limitation), so no DROP FOREIGN KEY needed.

DROP TABLE IF EXISTS alert_types;
