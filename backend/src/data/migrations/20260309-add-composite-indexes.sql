-- Migration: Add composite indexes for common advisory query patterns
-- Date: 2026-03-09
-- Issue: #13 - Missing composite indexes degrade query performance at scale
--
-- Indexes added:
--   1. (office_id, severity)          - filter advisories for an office by severity
--   2. (office_id, status, end_time)  - get active/non-expired advisories per office
--   3. (vtec_event_id, office_id, status) - findByVTECEventID() composite lookup
--   4. (status, last_updated)         - getRecentlyUpdated() and markExpired() ORDER BY

-- Allows efficient "show me all Extreme advisories for office X" queries
CREATE INDEX idx_advisories_office_severity
    ON advisories(office_id, severity);

-- Covers getByOffice() with time filtering; extends existing (office_id, status) index
-- to also support expiry checks without a full table scan on end_time
CREATE INDEX idx_advisories_office_status_endtime
    ON advisories(office_id, status, end_time);

-- Covers findByVTECEventID(): WHERE vtec_event_id = ? AND office_id = ? AND status = ?
-- Existing single-column idx_vtec_event_id cannot satisfy the full predicate
CREATE INDEX idx_advisories_vtec_office_status
    ON advisories(vtec_event_id, office_id, status);

-- Covers getRecentlyUpdated() (WHERE status = 'active' ORDER BY last_updated DESC)
-- and markExpired() (WHERE status = 'active' AND end_time < NOW()) scan patterns
CREATE INDEX idx_advisories_status_updated
    ON advisories(status, last_updated);
