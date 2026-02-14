-- Storm Scout Seed Data
-- MySQL/MariaDB compatible

-- Storm Scout Seed Data
-- Sample data for development and testing

-- Sample site data (first 10 sites from our list)
INSERT IGNORE INTO sites (site_code, name, city, state, latitude, longitude, region) VALUES
('0382', 'Miami Beach Testing Center', 'Miami Beach', 'FL', 25.87724, -80.24573, 'Southeast'),
('0610', 'Fort Lauderdale Testing Center', 'Fort Lauderdale', 'FL', 26.05184, -80.16929, 'Southeast'),
('0080', 'Orlando Testing Center', 'Orlando', 'FL', 28.68538, -81.39514, 'Southeast'),
('0024', 'Atlanta Testing Center', 'Atlanta', 'GA', 33.89753, -84.4841, 'Southeast'),
('0001', 'Los Angeles Testing Center', 'Los Angeles', 'CA', 33.9896, -118.37949, 'West'),
('0051', 'Dallas Testing Center', 'Dallas', 'TX', 32.9185, -96.76861, 'South Central'),
('0062', 'Washington DC Testing Center', 'Washington', 'DC', 38.90291, -77.03782, 'Mid-Atlantic'),
('0015', 'Seattle Testing Center', 'Seattle', 'WA', 47.78571, -122.31934, 'West'),
('5194', 'Boston Testing Center', 'Boston', 'MA', 42.05611, -71.06944, 'Northeast'),
('3251', 'Chicago Testing Center', 'Chicago', 'IL', 41.88233, -87.63199, 'Midwest');

-- Sample advisory data (active weather events)
-- Hurricane warning for Florida sites
INSERT INTO advisories (site_id, advisory_type, severity, status, source, headline, description, start_time, end_time, issued_time) VALUES
(
    (SELECT id FROM sites WHERE site_code = '0382'),
    'Hurricane Warning',
    'Extreme',
    'active',
    'NOAA/NWS Miami',
    'Hurricane Warning in effect for Miami-Dade County',
    'A Hurricane Warning means that hurricane conditions are expected somewhere within the warning area. Preparations to protect life and property should be rushed to completion.',
    NOW(),
    DATE_ADD(NOW(), INTERVAL 48 HOUR),
    DATE_SUB(NOW(), INTERVAL 2 HOUR)
),
(
    (SELECT id FROM sites WHERE site_code = '0610'),
    'Hurricane Warning',
    'Extreme',
    'active',
    'NOAA/NWS Miami',
    'Hurricane Warning in effect for Broward County',
    'A Hurricane Warning means that hurricane conditions are expected somewhere within the warning area. Preparations to protect life and property should be rushed to completion.',
    NOW(),
    DATE_ADD(NOW(), INTERVAL 48 HOUR),
    DATE_SUB(NOW(), INTERVAL 2 HOUR)
);

-- Winter weather advisory for northern sites
INSERT INTO advisories (site_id, advisory_type, severity, status, source, headline, description, start_time, end_time, issued_time) VALUES
(
    (SELECT id FROM sites WHERE site_code = '3251'),
    'Winter Storm Warning',
    'Severe',
    'active',
    'NOAA/NWS Chicago',
    'Winter Storm Warning for Cook County',
    'Heavy snow expected. Total snow accumulations of 6 to 10 inches. Winds gusting as high as 40 mph.',
    DATE_ADD(NOW(), INTERVAL 6 HOUR),
    DATE_ADD(NOW(), INTERVAL 24 HOUR),
    DATE_SUB(NOW(), INTERVAL 1 HOUR)
),
(
    (SELECT id FROM sites WHERE site_code = '5194'),
    'Winter Weather Advisory',
    'Moderate',
    'active',
    'NOAA/NWS Boston',
    'Winter Weather Advisory for Suffolk County',
    'Snow expected. Total snow accumulations of 2 to 4 inches. Plan on slippery road conditions.',
    DATE_ADD(NOW(), INTERVAL 3 HOUR),
    DATE_ADD(NOW(), INTERVAL 18 HOUR),
    DATE_SUB(NOW(), INTERVAL 30 MINUTE)
);

-- Severe thunderstorm watch for central US
INSERT INTO advisories (site_id, advisory_type, severity, status, source, headline, description, start_time, end_time, issued_time) VALUES
(
    (SELECT id FROM sites WHERE site_code = '0051'),
    'Severe Thunderstorm Watch',
    'Moderate',
    'active',
    'NOAA/NWS Fort Worth',
    'Severe Thunderstorm Watch for Dallas County',
    'Conditions are favorable for the development of severe thunderstorms capable of producing damaging winds and large hail.',
    NOW(),
    DATE_ADD(NOW(), INTERVAL 8 HOUR),
    DATE_SUB(NOW(), INTERVAL 45 MINUTE)
);

-- Expired advisory example
INSERT INTO advisories (site_id, advisory_type, severity, status, source, headline, description, start_time, end_time, issued_time) VALUES
(
    (SELECT id FROM sites WHERE site_code = '0001'),
    'Wind Advisory',
    'Minor',
    'expired',
    'NOAA/NWS Los Angeles',
    'Wind Advisory expired for Los Angeles County',
    'Northeast winds 20 to 30 mph with gusts to 45 mph.',
    DATE_SUB(NOW(), INTERVAL 24 HOUR),
    DATE_SUB(NOW(), INTERVAL 2 HOUR),
    DATE_SUB(NOW(), INTERVAL 26 HOUR)
);

-- Sample site status data
-- Sites with active high-severity advisories should be marked accordingly
-- Using new 4-category system: open_normal, open_restricted, pending, closed
REPLACE INTO site_status (site_id, operational_status, reason, last_updated) VALUES
((SELECT id FROM sites WHERE site_code = '0382'), 'closed', 'Hurricane Warning - Site evacuated', NOW()),
((SELECT id FROM sites WHERE site_code = '0610'), 'closed', 'Hurricane Warning - Site evacuated', NOW()),
((SELECT id FROM sites WHERE site_code = '3251'), 'open_restricted', 'Winter Storm Warning - Monitoring conditions', NOW()),
((SELECT id FROM sites WHERE site_code = '5194'), 'pending', 'Winter Weather Advisory - Reduced operations', NOW()),
((SELECT id FROM sites WHERE site_code = '0051'), 'open_normal', 'Severe Thunderstorm Watch - Operations normal with precautions', NOW()),
((SELECT id FROM sites WHERE site_code = '0024'), 'open_normal', 'No active advisories', NOW()),
((SELECT id FROM sites WHERE site_code = '0001'), 'open_normal', 'No active advisories', NOW()),
((SELECT id FROM sites WHERE site_code = '0062'), 'open_normal', 'No active advisories', NOW()),
((SELECT id FROM sites WHERE site_code = '0015'), 'open_normal', 'No active advisories', NOW()),
((SELECT id FROM sites WHERE site_code = '0080'), 'open_normal', 'No active advisories', NOW());

-- Sample government/emergency notices
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
    'The President has declared an emergency for states affected by Hurricane. Federal assistance is available to supplement state and local response efforts.',
    'FL,GA,SC,NC',
    DATE_SUB(NOW(), INTERVAL 12 HOUR),
    NULL,
    'https://www.fema.gov'
);

-- Add more sites to reach a meaningful sample size
-- Note: sites.json already loaded 219 sites during init, these are just examples
INSERT IGNORE INTO sites (site_code, name, city, state, latitude, longitude, region) VALUES
('5221', 'San Juan Testing Center', 'San Juan', 'PR', 18.41632, -66.10629, 'Caribbean'),
('3106', 'Honolulu Testing Center', 'Honolulu', 'HI', 21.3084, -157.86056, 'Pacific'),
('0054', 'Denver Testing Center', 'Denver', 'CO', 39.60901, -104.90466, 'Mountain'),
('0074', 'Phoenix Testing Center', 'Phoenix', 'AZ', 33.50962, -112.10114, 'Southwest'),
('0020', 'Philadelphia Testing Center', 'Philadelphia', 'PA', 39.94816, -75.15174, 'Mid-Atlantic'),
('0901', 'Oklahoma City Testing Center', 'Oklahoma City', 'OK', 35.53053, -97.58133, 'South Central'),
('1015', 'Nashville Testing Center', 'Nashville', 'TN', 36.09784, -86.67748, 'Southeast'),
('0064', 'Minneapolis Testing Center', 'Minneapolis', 'MN', 44.85662, -93.32535, 'Midwest'),
('0116', 'Portland Testing Center', 'Portland', 'OR', 45.5259, -122.83252, 'West'),
('2703', 'Anchorage Testing Center', 'Anchorage', 'AK', 61.14568, -149.87072, 'Alaska');

-- Set default status for new sites
INSERT IGNORE INTO site_status (site_id, operational_status, reason) 
SELECT id, 'open_normal', 'No active advisories' FROM sites 
WHERE id NOT IN (SELECT site_id FROM site_status);
