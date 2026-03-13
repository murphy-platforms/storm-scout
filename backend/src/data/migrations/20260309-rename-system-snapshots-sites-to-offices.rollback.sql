-- Rollback: Restore offices_* columns to sites_* in system_snapshots
-- Reverts: 20260309-rename-system-snapshots-sites-to-offices.sql
-- Date: 2026-03-09

ALTER TABLE system_snapshots
    RENAME COLUMN offices_red                  TO sites_red,
    RENAME COLUMN offices_orange               TO sites_orange,
    RENAME COLUMN offices_yellow               TO sites_yellow,
    RENAME COLUMN offices_green                TO sites_green,
    RENAME COLUMN offices_closed               TO sites_closed,
    RENAME COLUMN offices_restricted           TO sites_restricted,
    RENAME COLUMN offices_pending              TO sites_pending,
    RENAME COLUMN offices_open                 TO sites_open,
    RENAME COLUMN total_offices_with_advisories TO total_sites_with_advisories;
