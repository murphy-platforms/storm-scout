-- Migration: Rename sites_* columns to offices_* in system_snapshots
-- Reason: Terminology standardised from "sites" to "offices"
-- Date: 2026-03-09
-- MariaDB: RENAME COLUMN is metadata-only (no table rebuild, instant on any row count)
--
-- Rollback: run 20260309-rename-system-snapshots-sites-to-offices.rollback.sql

ALTER TABLE system_snapshots
    RENAME COLUMN sites_red                  TO offices_red,
    RENAME COLUMN sites_orange               TO offices_orange,
    RENAME COLUMN sites_yellow               TO offices_yellow,
    RENAME COLUMN sites_green                TO offices_green,
    RENAME COLUMN sites_closed               TO offices_closed,
    RENAME COLUMN sites_restricted           TO offices_restricted,
    RENAME COLUMN sites_pending              TO offices_pending,
    RENAME COLUMN sites_open                 TO offices_open,
    RENAME COLUMN total_sites_with_advisories TO total_offices_with_advisories;
