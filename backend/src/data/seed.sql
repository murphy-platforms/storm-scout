-- Storm Scout Seed Data
-- MySQL/MariaDB compatible

-- NOTE: USPS site data is loaded via import-usps-sites.js + init-db, not seeded here.
-- To load 300 USPS locations:
--   1. node src/scripts/import-usps-sites.js /path/to/usps-locations.csv
--   2. npm run init-db   (loads sites.json into database)
-- The advisory/status inserts below are optional sample data for development only.

-- Sample government/emergency notices (no site dependency)
INSERT INTO notices (jurisdiction, jurisdiction_type, notice_type, title, description, affected_states, effective_time, expiration_time, source_url) VALUES
(
    'State of Florida',
    'State',
    'State of Emergency',
    'Governor declares State of Emergency for Hurricane',
    'The Governor has declared a state of emergency for all counties in the state of Florida due to the approaching hurricane. Residents are urged to prepare and follow evacuation orders from local officials.',
    'FL',
    DATE_SUB(NOW(), INTERVAL 6 HOUR),
    DATE_ADD(NOW(), INTERVAL 72 HOUR),
    'https://www.floridadisaster.org'
),
(
    'Cook County, IL',
    'County',
    'Winter Weather Emergency',
    'Snow Emergency declared for Cook County',
    'A snow emergency has been declared. All vehicles must be off snow routes within 3 hours. Public transportation may be delayed.',
    'IL',
    NOW(),
    DATE_ADD(NOW(), INTERVAL 48 HOUR),
    'https://www.cookcountyil.gov'
),
(
    'Federal - FEMA',
    'Federal',
    'Emergency Declaration',
    'Presidential Emergency Declaration for Southeast States',
    'The President has declared an emergency for states affected by the weather event. Federal assistance is available to supplement state and local response efforts.',
    'FL,GA,SC,NC',
    DATE_SUB(NOW(), INTERVAL 12 HOUR),
    NULL,
    'https://www.fema.gov'
);

-- Set default operational status for all loaded sites
INSERT IGNORE INTO site_status (site_id, operational_status, reason)
SELECT id, 'open_normal', 'No active advisories' FROM sites
WHERE id NOT IN (SELECT site_id FROM site_status);
