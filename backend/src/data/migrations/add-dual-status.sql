-- Migration: Add Dual Status System
-- Date: 2026-02-12
-- Description: Separates automatic weather impact from manual operational status
-- Co-Authored-By: Warp <agent@warp.dev>

-- Add new weather impact level column
ALTER TABLE site_status
ADD COLUMN weather_impact_level VARCHAR(10) NOT NULL DEFAULT 'green'
  COMMENT 'Automatic weather impact: green, yellow, orange, red'
AFTER operational_status;

-- Add manual decision tracking columns
ALTER TABLE site_status
ADD COLUMN decision_by VARCHAR(255) NULL
  COMMENT 'User/system who made operational status decision'
AFTER weather_impact_level;

ALTER TABLE site_status
ADD COLUMN decision_at DATETIME NULL
  COMMENT 'Timestamp of operational status decision'
AFTER decision_by;

ALTER TABLE site_status
ADD COLUMN decision_reason TEXT NULL
  COMMENT 'Explanation for operational status decision'
AFTER decision_at;

-- Add index for weather impact queries
ALTER TABLE site_status
ADD INDEX idx_weather_impact (weather_impact_level);

-- Migrate existing data
-- Map current operational_status to new values
UPDATE site_status
SET 
  operational_status = CASE operational_status
    WHEN 'Open' THEN 'open_normal'
    WHEN 'At Risk' THEN 'pending'
    WHEN 'Closed' THEN 'closed'
    ELSE 'open_normal'
  END,
  decision_by = 'system_migration',
  decision_at = NOW(),
  decision_reason = 'Initial setup during dual status migration - verify and update as needed'
WHERE decision_by IS NULL;

-- Set weather_impact_level based on highest severity advisory for each site
UPDATE site_status ss
LEFT JOIN (
  SELECT 
    site_id,
    MAX(CASE 
      WHEN severity = 'Extreme' THEN 4
      WHEN severity = 'Severe' THEN 3
      WHEN severity = 'Moderate' THEN 2
      WHEN severity = 'Minor' THEN 1
      ELSE 0
    END) as severity_level
  FROM advisories
  WHERE status = 'active'
  GROUP BY site_id
) a ON ss.site_id = a.site_id
SET ss.weather_impact_level = CASE
  WHEN a.severity_level >= 4 THEN 'red'
  WHEN a.severity_level = 3 THEN 'orange'
  WHEN a.severity_level = 2 THEN 'yellow'
  ELSE 'green'
END;

-- Verification queries
SELECT 'Migration completed. Verification results:' as status;
SELECT weather_impact_level, COUNT(*) as count FROM site_status GROUP BY weather_impact_level;
SELECT operational_status, COUNT(*) as count FROM site_status GROUP BY operational_status;
SELECT COUNT(*) as sites_with_decisions FROM site_status WHERE decision_by IS NOT NULL;
