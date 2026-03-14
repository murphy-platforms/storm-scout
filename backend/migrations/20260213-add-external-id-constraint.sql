-- Migration: Add Unique Constraint on external_id
-- Date: 2026-02-13
-- Purpose: Prevent duplicate advisories with same external_id
--
-- Prerequisites: 
--   - Resolve duplicate external_ids before applying this migration
--
-- Rollback: DROP INDEX idx_external_id_unique ON advisories;

-- Add unique index on external_id
ALTER TABLE advisories 
ADD UNIQUE INDEX idx_external_id_unique (external_id);

-- Verify constraint was created
SHOW INDEX FROM advisories WHERE Key_name = 'idx_external_id_unique';
