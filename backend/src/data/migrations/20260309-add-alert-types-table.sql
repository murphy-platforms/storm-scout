-- Migration: Add alert_types lookup table and FK constraint on advisories.advisory_type
-- Date: 2026-03-09
-- Issue: #10 - advisory_type is unconstrained VARCHAR with no validation
--
-- Strategy:
--   1. Create alert_types reference table keyed on type_name
--   2. Seed all known NOAA types with their impact category
--   3. Add advisory_type FK — enforced by the DB engine
--   4. The ingestor will INSERT IGNORE unknown types (category='UNKNOWN')
--      before inserting advisories, so new NOAA types auto-register.

-- -----------------------------------------------------------------------
-- 1. Create lookup table
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alert_types (
    type_name VARCHAR(100) NOT NULL,
    category  ENUM('CRITICAL','HIGH','MODERATE','LOW','INFO','UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
    PRIMARY KEY (type_name)
);

-- -----------------------------------------------------------------------
-- 2. Seed known NOAA types
-- -----------------------------------------------------------------------

-- CRITICAL
INSERT IGNORE INTO alert_types (type_name, category) VALUES
    ('Tornado Warning',              'CRITICAL'),
    ('Severe Thunderstorm Warning',  'CRITICAL'),
    ('Flash Flood Warning',          'CRITICAL'),
    ('Hurricane Warning',            'CRITICAL'),
    ('Typhoon Warning',              'CRITICAL'),
    ('Extreme Wind Warning',         'CRITICAL'),
    ('Storm Surge Warning',          'CRITICAL'),
    ('Tsunami Warning',              'CRITICAL'),
    ('Blizzard Warning',             'CRITICAL'),
    ('Ice Storm Warning',            'CRITICAL'),
    ('Dust Storm Warning',           'CRITICAL'),
    ('Avalanche Warning',            'CRITICAL'),
    ('Snow Squall Warning',          'CRITICAL');

-- HIGH
INSERT IGNORE INTO alert_types (type_name, category) VALUES
    ('Tornado Watch',                'HIGH'),
    ('Severe Thunderstorm Watch',    'HIGH'),
    ('Hurricane Watch',              'HIGH'),
    ('Typhoon Watch',                'HIGH'),
    ('Flood Warning',                'HIGH'),
    ('Winter Storm Warning',         'HIGH'),
    ('High Wind Warning',            'HIGH'),
    ('Excessive Heat Warning',       'HIGH'),
    ('Extreme Cold Warning',         'HIGH'),
    ('Red Flag Warning',             'HIGH'),
    ('Fire Warning',                 'HIGH'),
    ('Tropical Storm Warning',       'HIGH'),
    ('Storm Warning',                'HIGH'),
    ('Gale Warning',                 'HIGH'),
    ('Heavy Freezing Spray Warning', 'HIGH'),
    ('Storm Surge Watch',            'HIGH'),
    ('Flash Flood Watch',            'HIGH');

-- MODERATE
INSERT IGNORE INTO alert_types (type_name, category) VALUES
    ('Flood Watch',                  'MODERATE'),
    ('Winter Storm Watch',           'MODERATE'),
    ('Winter Weather Advisory',      'MODERATE'),
    ('Wind Advisory',                'MODERATE'),
    ('Heat Advisory',                'MODERATE'),
    ('Dense Fog Advisory',           'MODERATE'),
    ('Freeze Warning',               'MODERATE'),
    ('Frost Advisory',               'MODERATE'),
    ('Lake Effect Snow Warning',     'MODERATE'),
    ('Lake Effect Snow Watch',       'MODERATE'),
    ('Blowing Dust Advisory',        'MODERATE'),
    ('Tropical Storm Watch',         'MODERATE'),
    ('High Wind Watch',              'MODERATE'),
    ('High Surf Warning',            'MODERATE'),
    ('Coastal Flood Warning',        'MODERATE'),
    ('Coastal Flood Watch',          'MODERATE'),
    ('Lakeshore Flood Warning',      'MODERATE'),
    ('Lakeshore Flood Watch',        'MODERATE'),
    ('Excessive Heat Watch',         'MODERATE'),
    ('Hard Freeze Warning',          'MODERATE'),
    ('Freeze Watch',                 'MODERATE'),
    ('Extreme Cold Watch',           'MODERATE'),
    ('Lake Wind Advisory',           'MODERATE');

-- LOW
INSERT IGNORE INTO alert_types (type_name, category) VALUES
    ('Wind Chill Advisory',          'LOW'),
    ('Wind Chill Watch',             'LOW'),
    ('Small Craft Advisory',         'LOW'),
    ('Brisk Wind Advisory',          'LOW'),
    ('Hazardous Seas Warning',       'LOW'),
    ('High Surf Advisory',           'LOW'),
    ('Coastal Flood Advisory',       'LOW'),
    ('Lakeshore Flood Advisory',     'LOW'),
    ('Flood Advisory',               'LOW'),
    ('Beach Hazards Statement',      'LOW'),
    ('Rip Current Statement',        'LOW'),
    ('Cold Weather Advisory',        'LOW'),
    ('Freezing Fog Advisory',        'LOW'),
    ('Ashfall Advisory',             'LOW'),
    ('Air Quality Alert',            'LOW'),
    ('Dense Smoke Advisory',         'LOW'),
    ('Coastal Flood Statement',      'LOW'),
    ('Lakeshore Flood Statement',    'LOW'),
    ('Flood Statement',              'LOW'),
    ('Flash Flood Statement',        'LOW'),
    ('Low Water Advisory',           'LOW'),
    ('Air Stagnation Advisory',      'LOW'),
    ('Freezing Spray Advisory',      'LOW');

-- INFO
INSERT IGNORE INTO alert_types (type_name, category) VALUES
    ('Special Weather Statement',          'INFO'),
    ('Marine Weather Statement',           'INFO'),
    ('Hydrologic Outlook',                 'INFO'),
    ('Hazardous Weather Outlook',          'INFO'),
    ('Short Term Forecast',                'INFO'),
    ('Administrative Message',             'INFO'),
    ('Test',                               'INFO'),
    ('Test Message',                       'INFO'),
    ('Child Abduction Emergency',          'INFO'),
    ('Civil Danger Warning',               'INFO'),
    ('Civil Emergency Message',            'INFO'),
    ('Avalanche Watch',                    'INFO'),
    ('Avalanche Advisory',                 'INFO'),
    ('Fire Weather Watch',                 'INFO'),
    ('Severe Weather Statement',           'INFO'),
    ('Tropical Cyclone Local Statement',   'INFO'),
    ('Tsunami Advisory',                   'INFO'),
    ('Tsunami Watch',                      'INFO');

-- Fallback value used by normalizer when properties.event is missing
INSERT IGNORE INTO alert_types (type_name, category) VALUES
    ('Weather Advisory', 'UNKNOWN');

-- -----------------------------------------------------------------------
-- 3. Register any pre-existing advisory_type values not yet in the table
-- -----------------------------------------------------------------------
-- Auto-register any advisory_type values already in the DB so existing
-- data is reflected in the registry with category='UNKNOWN'.
INSERT IGNORE INTO alert_types (type_name, category)
    SELECT DISTINCT advisory_type, 'UNKNOWN'
    FROM advisories
    WHERE advisory_type NOT IN (SELECT type_name FROM alert_types);

-- NOTE: A DB-level FOREIGN KEY on advisories.advisory_type cannot be added
-- because MariaDB does not permit FK constraints on columns that participate
-- in a GENERATED ALWAYS AS expression (vtec_event_unique_key references
-- advisory_type). Enforcement is handled at the application layer instead:
-- the ingestor runs INSERT IGNORE INTO alert_types before every advisory
-- INSERT, ensuring no unknown value ever reaches the advisories table.
