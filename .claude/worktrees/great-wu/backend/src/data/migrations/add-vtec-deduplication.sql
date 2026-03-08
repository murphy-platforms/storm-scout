-- Migration: Add VTEC-based deduplication support
-- Date: 2026-02-12
-- Purpose: Add vtec_code column to advisories table to enable proper deduplication of NOAA alert updates
--
-- Background:
-- NOAA issues weather alert updates with different external_id values, causing our system
-- to create duplicate entries. VTEC (Valid Time Event Code) remains consistent across updates
-- for the same weather event, making it the correct deduplication key.
--
-- VTEC Format Example: /O.CON.PAJK.WS.W.0005.000000T0000Z-260213T0000Z/
-- - Event number (0005) stays the same across all updates for the same weather event
-- - Composite key: (vtec_code, site_id, advisory_type) uniquely identifies an event

-- Add vtec_code column
ALTER TABLE advisories 
ADD COLUMN vtec_code VARCHAR(255) DEFAULT NULL 
COMMENT 'NOAA VTEC code for alert deduplication' 
AFTER external_id;

-- Add composite index for efficient VTEC-based lookups
-- This index is used when checking if an alert update already exists
CREATE INDEX idx_vtec_site_type ON advisories (vtec_code, site_id, advisory_type);

-- Add single vtec_code index for queries filtering by VTEC only
CREATE INDEX idx_vtec_code ON advisories (vtec_code);

-- Add index for status + vtec to improve active alert queries
CREATE INDEX idx_status_vtec ON advisories (status, vtec_code);

-- Update advisory table comment
ALTER TABLE advisories COMMENT = 'Weather advisories from NOAA. Uses vtec_code for deduplication of alert updates.';
