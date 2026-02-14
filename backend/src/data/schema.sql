-- Storm Scout Database Schema
-- MySQL/MariaDB compatible
-- Updated: 2026-02-13

-- Sites table: static list of testing center locations
CREATE TABLE IF NOT EXISTS sites (
    id INT AUTO_INCREMENT PRIMARY KEY,
    site_code VARCHAR(10) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(2) NOT NULL,
    county VARCHAR(100),                  -- County name for UGC matching
    ugc_codes TEXT,                       -- JSON array of UGC codes for this site
    latitude DECIMAL(10, 7) NOT NULL,
    longitude DECIMAL(10, 7) NOT NULL,
    region VARCHAR(50),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_sites_state ON sites(state);
CREATE INDEX idx_sites_region ON sites(region);
CREATE INDEX idx_sites_coords ON sites(latitude, longitude);
CREATE INDEX idx_sites_county ON sites(county);

-- Advisories table: weather alerts and warnings mapped to sites
CREATE TABLE IF NOT EXISTS advisories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    external_id VARCHAR(255),             -- NOAA alert ID (unique per alert)
    site_id INT NOT NULL,
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
            THEN CONCAT(vtec_event_id, '|', site_id, '|', advisory_type)
            ELSE NULL
        END
    ) STORED,
    raw_payload TEXT,                     -- JSON string of original data for reference
    FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
    UNIQUE INDEX idx_advisories_external_id (external_id),
    UNIQUE INDEX idx_vtec_event_unique_active (vtec_event_unique_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_advisories_site ON advisories(site_id);
CREATE INDEX idx_advisories_status ON advisories(status);
CREATE INDEX idx_advisories_severity ON advisories(severity);
CREATE INDEX idx_advisories_status_severity ON advisories(status, severity);
CREATE INDEX idx_advisories_time ON advisories(start_time, end_time);
CREATE INDEX idx_advisories_status_time ON advisories(status, start_time, end_time);
CREATE INDEX idx_advisories_site_status ON advisories(site_id, status);
CREATE INDEX idx_vtec_event_id ON advisories(vtec_event_id);
CREATE INDEX idx_vtec_action ON advisories(vtec_action);

-- Enforce valid severity values
ALTER TABLE advisories 
ADD CONSTRAINT chk_advisories_severity 
CHECK (severity IN ('Extreme', 'Severe', 'Moderate', 'Minor'));

-- Site status table: operational status of each testing center
CREATE TABLE IF NOT EXISTS site_status (
    id INT AUTO_INCREMENT PRIMARY KEY,
    site_id INT NOT NULL UNIQUE,
    -- Operational status (set by IMT/Operations)
    operational_status VARCHAR(20) NOT NULL DEFAULT 'open_normal',  -- 'open_normal', 'open_restricted', 'closed', 'pending'
    -- Weather impact level (set automatically by ingestion)
    weather_impact_level VARCHAR(20) DEFAULT 'green',  -- 'green', 'yellow', 'orange', 'red'
    reason TEXT,                          -- Legacy: why the status changed
    -- Decision tracking
    decision_by VARCHAR(100),             -- Who made the operational decision
    decision_at DATETIME,                 -- When the decision was made
    decision_reason TEXT,                 -- Reason for the operational decision
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_site_status_status ON site_status(operational_status);
CREATE INDEX idx_site_status_weather ON site_status(weather_impact_level);

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
    site_id INT NOT NULL,
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
    FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_advisory_history_site ON advisory_history(site_id);
CREATE INDEX idx_advisory_history_time ON advisory_history(snapshot_time);
CREATE INDEX idx_advisory_history_site_time ON advisory_history(site_id, snapshot_time);
