-- Migration: Add advisory_history table for trend analysis
-- Phase 3 - Historical tracking for site impact trends

-- Advisory history table: snapshots of advisory state over time
CREATE TABLE IF NOT EXISTS advisory_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    site_id INT NOT NULL,
    snapshot_time DATETIME NOT NULL,
    
    -- Aggregated metrics at snapshot time
    advisory_count INT NOT NULL DEFAULT 0,
    highest_severity VARCHAR(50) NOT NULL,
    highest_severity_type VARCHAR(100),
    
    -- Status tracking
    has_extreme BOOLEAN DEFAULT FALSE,
    has_severe BOOLEAN DEFAULT FALSE,
    has_moderate BOOLEAN DEFAULT FALSE,
    
    -- Action tracking
    new_count INT DEFAULT 0,
    upgrade_count INT DEFAULT 0,
    
    -- Advisory list (JSON) - stores IDs and basic info
    advisory_snapshot JSON,
    
    -- Metadata
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Indexes for efficient querying
CREATE INDEX idx_history_site_time ON advisory_history(site_id, snapshot_time);
CREATE INDEX idx_history_snapshot_time ON advisory_history(snapshot_time);
CREATE INDEX idx_history_severity ON advisory_history(highest_severity);

-- Note: This table will be populated by the ingestion script
-- Each run will create a snapshot of the current advisory state
