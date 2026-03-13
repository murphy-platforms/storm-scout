-- Migration: Add composite index and severity CHECK constraint
-- Date: 2026-02-14
-- Fixes: BUG-PROD-005 (performance), BUG-PROD-008 (data integrity)

-- BUG-PROD-005: Add composite index for status + severity queries
-- This improves performance for queries that filter by both status AND severity
-- (e.g., "get all active advisories with Extreme severity")
CREATE INDEX IF NOT EXISTS idx_advisories_status_severity 
ON advisories(status, severity);

-- BUG-PROD-008: Add CHECK constraint to enforce valid severity values
-- First, update any invalid severity values to 'Minor' (safety cleanup)
UPDATE advisories 
SET severity = 'Minor' 
WHERE severity NOT IN ('Extreme', 'Severe', 'Moderate', 'Minor');

-- Add CHECK constraint (MariaDB 10.2.1+ required)
-- Note: If constraint already exists, this will fail gracefully
ALTER TABLE advisories 
ADD CONSTRAINT chk_advisories_severity 
CHECK (severity IN ('Extreme', 'Severe', 'Moderate', 'Minor'));
