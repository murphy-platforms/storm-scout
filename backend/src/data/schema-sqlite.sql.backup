-- Storm Scout Database Schema
-- SQLite3 compatible

-- Sites table: static list of testing center locations
CREATE TABLE IF NOT EXISTS sites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_code VARCHAR(10) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(2) NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    region VARCHAR(50),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sites_state ON sites(state);
CREATE INDEX idx_sites_region ON sites(region);
CREATE INDEX idx_sites_coords ON sites(latitude, longitude);

-- Advisories table: weather alerts and warnings mapped to sites
CREATE TABLE IF NOT EXISTS advisories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id INTEGER NOT NULL,
    advisory_type VARCHAR(100) NOT NULL,  -- e.g., 'Hurricane Warning', 'Tornado Watch', 'Winter Storm Advisory'
    severity VARCHAR(50) NOT NULL,        -- 'Extreme', 'Severe', 'Moderate', 'Minor', 'Unknown'
    status VARCHAR(20) NOT NULL DEFAULT 'active',  -- 'active', 'expired', 'cancelled'
    source VARCHAR(100) NOT NULL,         -- e.g., 'NOAA', 'NWS', 'State Emergency'
    headline VARCHAR(500),                -- Short summary/headline
    description TEXT,                     -- Full advisory description
    start_time DATETIME,
    end_time DATETIME,
    issued_time DATETIME,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    raw_payload TEXT,                     -- JSON string of original data for reference
    FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

CREATE INDEX idx_advisories_site ON advisories(site_id);
CREATE INDEX idx_advisories_status ON advisories(status);
CREATE INDEX idx_advisories_severity ON advisories(severity);
CREATE INDEX idx_advisories_time ON advisories(start_time, end_time);

-- Site status table: operational status of each testing center
CREATE TABLE IF NOT EXISTS site_status (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id INTEGER NOT NULL UNIQUE,
    operational_status VARCHAR(20) NOT NULL DEFAULT 'Open',  -- 'Open', 'Closed', 'At Risk'
    reason TEXT,                          -- Why the status changed (e.g., 'Hurricane Warning', 'Severe Weather')
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);

CREATE INDEX idx_site_status_status ON site_status(operational_status);

-- Government/emergency notices table: broader notices that may affect operations
CREATE TABLE IF NOT EXISTS notices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jurisdiction VARCHAR(100) NOT NULL,   -- e.g., 'State of Florida', 'Harris County, TX'
    jurisdiction_type VARCHAR(50),        -- 'State', 'County', 'City', 'Federal'
    notice_type VARCHAR(100) NOT NULL,    -- e.g., 'Emergency Declaration', 'Evacuation Order', 'State of Emergency'
    title VARCHAR(500) NOT NULL,
    description TEXT,
    affected_states TEXT,                 -- Comma-separated state codes
    effective_time DATETIME,
    expiration_time DATETIME,
    source_url TEXT,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notices_jurisdiction ON notices(jurisdiction);
CREATE INDEX idx_notices_type ON notices(notice_type);
CREATE INDEX idx_notices_effective ON notices(effective_time, expiration_time);
