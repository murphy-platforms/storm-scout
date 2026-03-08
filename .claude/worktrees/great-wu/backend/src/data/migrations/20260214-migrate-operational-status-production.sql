-- Production Migration: Convert Legacy Operational Status to 4-Category System
-- Date: 2026-02-14
-- Description: Converts 'Open', 'At Risk', 'Closed' to 'open_normal', 'open_restricted', 'pending', 'closed'
-- Safe to run multiple times (idempotent)
-- Co-Authored-By: Warp <agent@warp.dev>

-- Show current state BEFORE migration
SELECT '=== BEFORE MIGRATION ===' as status;
SELECT operational_status, COUNT(*) as count 
FROM site_status 
GROUP BY operational_status 
ORDER BY operational_status;

-- Convert legacy operational status values to new 4-category system
UPDATE site_status
SET 
  operational_status = CASE operational_status
    WHEN 'Open' THEN 'open_normal'
    WHEN 'At Risk' THEN 'open_restricted'
    WHEN 'Closed' THEN 'closed'
    WHEN 'Pending' THEN 'pending'
    -- Already converted values (no-op)
    WHEN 'open_normal' THEN 'open_normal'
    WHEN 'open_restricted' THEN 'open_restricted'
    WHEN 'closed' THEN 'closed'
    WHEN 'pending' THEN 'pending'
    -- Fallback for any unexpected values
    ELSE 'open_normal'
  END,
  -- Track that this was a system migration (only if decision_by is NULL)
  decision_by = COALESCE(decision_by, 'system_migration'),
  decision_at = COALESCE(decision_at, NOW()),
  decision_reason = COALESCE(decision_reason, 'Automated migration from legacy 3-category to 4-category status system')
WHERE 
  -- Only update rows that have legacy values
  operational_status IN ('Open', 'At Risk', 'Closed', 'Pending');

-- Show current state AFTER migration
SELECT '=== AFTER MIGRATION ===' as status;
SELECT operational_status, COUNT(*) as count 
FROM site_status 
GROUP BY operational_status 
ORDER BY operational_status;

-- Verification: Check for any remaining legacy values
SELECT '=== VERIFICATION ===' as status;
SELECT 
  CASE 
    WHEN COUNT(*) = 0 THEN 'SUCCESS: No legacy values remaining'
    ELSE CONCAT('WARNING: ', COUNT(*), ' sites still have legacy values')
  END as result
FROM site_status
WHERE operational_status IN ('Open', 'At Risk', 'Closed', 'Pending');

-- Show sample of migrated records
SELECT '=== SAMPLE RECORDS ===' as status;
SELECT s.site_code, s.name, ss.operational_status, ss.weather_impact_level, ss.decision_by
FROM site_status ss
JOIN sites s ON ss.site_id = s.id
ORDER BY ss.operational_status, s.site_code
LIMIT 10;
