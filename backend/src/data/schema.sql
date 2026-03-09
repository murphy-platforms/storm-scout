-- Storm Scout Database Schema
-- MySQL/MariaDB compatible
-- Updated: 2026-03-08

-- Offices table: static list of USPS locations
CREATE TABLE IF NOT EXISTS offices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    office_code VARCHAR(10) UNIQUE NOT NULL,  -- 5-digit zip code
    name VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(2) NOT NULL,
    county VARCHAR(100),                  -- County name for UGC matching
    ugc_codes TEXT,                       -- JSON array of UGC codes for this office
    cwa VARCHAR(10),                      -- NWS County Warning Area office code (e.g., IND, GYX)
    latitude DECIMAL(10, 7) NOT NULL,
    longitude DECIMAL(10, 7) NOT NULL,
    region VARCHAR(50),
    observation_station VARCHAR(10),          -- Nearest NWS observation station ICAO code (e.g., KORD)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_offices_state ON offices(state);
CREATE INDEX idx_offices_region ON offices(region);
CREATE INDEX idx_offices_coords ON offices(latitude, longitude);
CREATE INDEX idx_offices_county ON offices(county);

-- Advisories table: weather alerts and warnings mapped to offices
CREATE TABLE IF NOT EXISTS advisories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    external_id VARCHAR(255),             -- NOAA alert ID (unique per alert)
    office_id INT NOT NULL,
    advisory_type VARCHAR(100) NOT NULL,  -- e.g., 'Hurricane Warning', 'Tornado Watch', 'Winter Storm Advisory'
    severity VARCHAR(50) NOT NULL,        -- 'Extreme', 'Severe', 'Moderate', 'Minor', 'Unknown'
    status VARCHAR(20) NOT NULL DEFAULT 'active',  -- 'active', 'expired', 'cancelled'
    source VARCHAR(100) NOT NULL,         -- e.g., 'NOAA', 'NWS', 'State Emergency'
    headline VARCHAR(500),                -- Short summary/headline
    description TEXT,                     -- Full advisory description
    start_time DATETIME,
    end_time DATETIME,
    issued_time DATETIME,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    -- VTEC (Valid Time Event Code) fields for deduplication
    vtec_code VARCHAR(255),               -- Full VTEC code from NOAA
    vtec_event_id VARCHAR(50),            -- Persistent event ID (OFFICE.PHENOM.SIG.EVENT)
    vtec_action VARCHAR(10),              -- Action code (NEW, CON, EXT, EXP, CAN, etc.)
    -- Generated column for uniqueness constraint on active VTEC events
    vtec_event_unique_key VARCHAR(600) GENERATED ALWAYS AS (
        CASE
            WHEN status = 'active' AND vtec_event_id IS NOT NULL
            THEN CONCAT(vtec_event_id, '|', office_id, '|', advisory_type)
            ELSE NULL
        END
    ) STORED,
    raw_payload TEXT,                     -- JSON string of original data for reference
    FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE CASCADE,
    UNIQUE INDEX idx_advisories_external_office (external_id, office_id),
    UNIQUE INDEX idx_vtec_event_unique_active (vtec_event_unique_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_advisories_office ON advisories(office_id);
CREATE INDEX idx_advisories_status ON advisories(status);
CREATE INDEX idx_advisories_severity ON advisories(severity);
CREATE INDEX idx_advisories_status_severity ON advisories(status, severity);
CREATE INDEX idx_advisories_time ON advisories(start_time, end_time);
CREATE INDEX idx_advisories_status_time ON advisories(status, start_time, end_time);
CREATE INDEX idx_advisories_office_status ON advisories(office_id, status);
CREATE INDEX idx_vtec_event_id ON advisories(vtec_event_id);
CREATE INDEX idx_vtec_action ON advisories(vtec_action);

-- Enforce valid severity values
ALTER TABLE advisories
ADD CONSTRAINT chk_advisories_severity
CHECK (severity IN ('Extreme', 'Severe', 'Moderate', 'Minor'));

-- Office status table: operational status of each USPS location
CREATE TABLE IF NOT EXISTS office_status (
    id INT AUTO_INCREMENT PRIMARY KEY,
    office_id INT NOT NULL UNIQUE,
    -- Operational status (set by USPS Operations)
    operational_status VARCHAR(20) NOT NULL DEFAULT 'open_normal',  -- 'open_normal', 'open_restricted', 'closed', 'pending'
    -- Weather impact level (set automatically by ingestion)
    weather_impact_level VARCHAR(20) DEFAULT 'green',  -- 'green', 'yellow', 'orange', 'red'
    reason TEXT,                          -- Legacy: why the status changed
    -- Decision tracking
    decision_by VARCHAR(100),             -- Who made the operational decision
    decision_at DATETIME,                 -- When the decision was made
    decision_reason TEXT,                 -- Reason for the operational decision
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_office_status_status ON office_status(operational_status);
CREATE INDEX idx_office_status_weather ON office_status(weather_impact_level);

-- Government/emergency notices table: broader notices that may affect operations
CREATE TABLE IF NOT EXISTS notices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    jurisdiction VARCHAR(100) NOT NULL,   -- e.g., 'State of Florida', 'Harris County, TX'
    jurisdiction_type VARCHAR(50),        -- 'State', 'County', 'City', 'Federal'
    notice_type VARCHAR(100) NOT NULL,    -- e.g., 'Emergency Declaration', 'Evacuation Order', 'State of Emergency'
    title VARCHAR(500) NOT NULL,
    description TEXT,
    affected_states TEXT,                 -- Comma-separated state codes
    effective_time DATETIME,
    expiration_time DATETIME,
    source_url TEXT,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_notices_jurisdiction ON notices(jurisdiction);
CREATE INDEX idx_notices_type ON notices(notice_type);
CREATE INDEX idx_notices_effective ON notices(effective_time, expiration_time);

-- Advisory history table: snapshots for trend analysis
CREATE TABLE IF NOT EXISTS advisory_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    office_id INT NOT NULL,
    snapshot_time DATETIME NOT NULL,
    advisory_count INT DEFAULT 0,
    highest_severity VARCHAR(50),
    highest_severity_type VARCHAR(100),
    has_extreme BOOLEAN DEFAULT FALSE,
    has_severe BOOLEAN DEFAULT FALSE,
    has_moderate BOOLEAN DEFAULT FALSE,
    new_count INT DEFAULT 0,              -- Count of NEW action advisories
    upgrade_count INT DEFAULT 0,          -- Count of UPG action advisories
    advisory_snapshot TEXT,               -- JSON snapshot of advisory details
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_advisory_history_office ON advisory_history(office_id);
CREATE INDEX idx_advisory_history_time ON advisory_history(snapshot_time);
CREATE INDEX idx_advisory_history_office_time ON advisory_history(office_id, snapshot_time);

-- Office observations table: current weather conditions per office (replaced each ingestion cycle)
CREATE TABLE IF NOT EXISTS office_observations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    office_id INT NOT NULL,
    station_id VARCHAR(10) NOT NULL,            -- ICAO station code (e.g., KORD)
    temperature_c DECIMAL(5,2),                 -- Temperature in °C
    relative_humidity DECIMAL(5,2),             -- Humidity %
    dewpoint_c DECIMAL(5,2),                    -- Dew point in °C
    wind_speed_kmh DECIMAL(6,2),                -- Wind speed in km/h
    wind_direction_deg INT,                     -- Wind direction in degrees
    wind_gust_kmh DECIMAL(6,2),                 -- Wind gust in km/h
    barometric_pressure_pa DECIMAL(10,2),       -- Pressure in Pascals
    visibility_m DECIMAL(10,2),                 -- Visibility in meters
    wind_chill_c DECIMAL(5,2),                  -- Wind chill in °C
    heat_index_c DECIMAL(5,2),                  -- Heat index in °C
    cloud_layers TEXT,                          -- JSON string of cloud layer data
    text_description VARCHAR(255),              -- e.g., "Cloudy", "Partly Sunny"
    observed_at DATETIME,                       -- When the station recorded the observation
    ingested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE INDEX idx_office_observations_office (office_id),
    FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_office_observations_station ON office_observations(station_id);

-- System snapshots table: system-wide aggregate metrics captured every 6 hours
-- Retained for 3 days (12 snapshots). Faster queries than aggregating advisory_history.
CREATE TABLE IF NOT EXISTS system_snapshots (
    id INT AUTO_INCREMENT PRIMARY KEY,
    snapshot_time DATETIME NOT NULL UNIQUE,

    -- Aggregate counts by severity
    extreme_count INT DEFAULT 0,
    severe_count INT DEFAULT 0,
    moderate_count INT DEFAULT 0,
    minor_count INT DEFAULT 0,

    -- Offices impacted by weather level
    offices_red INT DEFAULT 0,
    offices_orange INT DEFAULT 0,
    offices_yellow INT DEFAULT 0,
    offices_green INT DEFAULT 0,

    -- Operational status breakdown
    offices_closed INT DEFAULT 0,
    offices_restricted INT DEFAULT 0,
    offices_pending INT DEFAULT 0,
    offices_open INT DEFAULT 0,

    -- Advisory action breakdown
    new_advisories INT DEFAULT 0,
    continued_advisories INT DEFAULT 0,
    upgraded_advisories INT DEFAULT 0,

    -- Total metrics
    total_advisories INT DEFAULT 0,
    total_offices_with_advisories INT DEFAULT 0,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='System-wide snapshots captured every 6 hours, retained for 3 days';

CREATE INDEX idx_system_snapshots_time ON system_snapshots(snapshot_time);
