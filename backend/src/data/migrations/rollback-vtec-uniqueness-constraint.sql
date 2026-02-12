-- Rollback: Remove VTEC Uniqueness Constraint
-- Date: 2026-02-12

-- Drop the unique index
DROP INDEX idx_vtec_unique_active ON advisories;

-- Drop the generated column
ALTER TABLE advisories DROP COLUMN vtec_unique_key;
