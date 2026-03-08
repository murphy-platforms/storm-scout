-- Migration: Add site_reference table and ProInsights display columns to sites
-- Purpose: Support recurring ProInsights CSV imports and site data synchronization
-- Date: 2026-02-20

-- =============================================================================
-- Step 1: Create site_reference table (staging table for ProInsights CSV imports)
-- =============================================================================
CREATE TABLE IF NOT EXISTS site_reference (
    id INT AUTO_INCREMENT PRIMARY KEY,
    site_code VARCHAR(10) NOT NULL,
    parent_site_code VARCHAR(10) NOT NULL,
    metro_area_name VARCHAR(255),
    site_name VARCHAR(255),
    city VARCHAR(100),
    state_province VARCHAR(100),
    state VARCHAR(2),
    channel_engagement_manager VARCHAR(100),
    country VARCHAR(100),
    sub_region VARCHAR(100),
    region VARCHAR(100),
    site_status VARCHAR(50),
    channel VARCHAR(50),
    management_type VARCHAR(100),
    delivery_type VARCHAR(50),
    cost_center VARCHAR(20),
    workstations_active INT DEFAULT 0,
    ta_workstations_active INT DEFAULT 0,
    imported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE INDEX idx_site_ref_site_code (site_code),
    INDEX idx_site_ref_parent_code (parent_site_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================================
-- Step 2: Add ProInsights display columns to sites table
-- =============================================================================
ALTER TABLE sites ADD COLUMN metro_area_name VARCHAR(255) DEFAULT NULL AFTER region;
ALTER TABLE sites ADD COLUMN reference_site_name VARCHAR(255) DEFAULT NULL AFTER metro_area_name;
ALTER TABLE sites ADD COLUMN channel_engagement_manager VARCHAR(100) DEFAULT NULL AFTER reference_site_name;
ALTER TABLE sites ADD COLUMN management_type VARCHAR(100) DEFAULT NULL AFTER channel_engagement_manager;
ALTER TABLE sites ADD COLUMN workstations_active INT DEFAULT 0 AFTER management_type;
ALTER TABLE sites ADD COLUMN ta_workstations_active INT DEFAULT 0 AFTER workstations_active;

-- =============================================================================
-- Verification queries (run after migration)
-- =============================================================================
-- DESCRIBE site_reference;
-- DESCRIBE sites;
-- SELECT COUNT(*) FROM site_reference;
