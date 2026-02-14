-- Migration: Add system_snapshots table for aggregate historical data
-- Purpose: Track system-wide metrics over time (faster queries than aggregating advisory_history)
-- Date: 2026-02-14

CREATE TABLE IF NOT EXISTS system_snapshots (
    id INT AUTO_INCREMENT PRIMARY KEY,
    snapshot_time DATETIME NOT NULL UNIQUE,
    
    -- Aggregate counts by severity
    extreme_count INT DEFAULT 0,
    severe_count INT DEFAULT 0,
    moderate_count INT DEFAULT 0,
    minor_count INT DEFAULT 0,
    
    -- Sites impacted by weather level
    sites_red INT DEFAULT 0,
    sites_orange INT DEFAULT 0,
    sites_yellow INT DEFAULT 0,
    sites_green INT DEFAULT 0,
    
    -- Operational status breakdown
    sites_closed INT DEFAULT 0,
    sites_restricted INT DEFAULT 0,
    sites_pending INT DEFAULT 0,
    sites_open INT DEFAULT 0,
    
    -- Advisory action breakdown
    new_advisories INT DEFAULT 0,
    continued_advisories INT DEFAULT 0,
    upgraded_advisories INT DEFAULT 0,
    
    -- Total metrics
    total_advisories INT DEFAULT 0,
    total_sites_with_advisories INT DEFAULT 0,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_system_snapshots_time ON system_snapshots(snapshot_time);

-- Add retention policy comment
ALTER TABLE system_snapshots COMMENT = 'System-wide snapshots captured every 6 hours, retained for 3 days';
ALTER TABLE advisory_history COMMENT = 'Per-site snapshots captured every 6 hours, retained for 3 days';
