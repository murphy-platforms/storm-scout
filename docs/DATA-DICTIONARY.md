# Storm Scout Data Dictionary

Complete column reference for all database tables. Schema source: `backend/src/data/schema.sql`.

---

## Table of Contents

1. [offices](#offices)
2. [advisories](#advisories)
3. [advisory_history](#advisory_history)
4. [office_status](#office_status)
5. [notices](#notices)
6. [office_observations](#office_observations)
7. [system_snapshots](#system_snapshots)
8. [alert_types](#alert_types)
9. [schema_migrations](#schema_migrations)

---

## offices

**Purpose:** Static reference list of all 300 office locations. Loaded from `backend/src/data/offices.json` at database initialization and rarely modified thereafter.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | INT AUTO_INCREMENT | No | Internal primary key |
| `office_code` | VARCHAR(10) | No | 5-digit zip code; primary external identifier |
| `name` | VARCHAR(255) | No | Full office name |
| `city` | VARCHAR(100) | No | City name |
| `state` | VARCHAR(2) | No | 2-letter US state/territory code |
| `county` | VARCHAR(100) | Yes | County name; used for UGC zone matching |
| `ugc_codes` | TEXT | Yes | JSON array of NWS Universal Geographic Code zones (e.g. `["TXZ123","TXC456"]`). Defines which NOAA alerts affect this office. |
| `cwa` | VARCHAR(10) | Yes | NWS County Warning Area code (e.g. `PAFC`, `IND`). Identifies the NWS forecast office responsible for this location. |
| `latitude` | DECIMAL(10,7) | No | Decimal latitude |
| `longitude` | DECIMAL(10,7) | No | Decimal longitude |
| `region` | VARCHAR(50) | Yes | Region name |
| `observation_station` | VARCHAR(10) | Yes | Nearest NWS observation station ICAO code (e.g. `KORD`). Used to fetch current weather conditions. |
| `created_at` | DATETIME | No | Row creation timestamp (auto-set) |
| `updated_at` | DATETIME | No | Last modification timestamp (auto-updated) |

**Indexes:**
- `PRIMARY KEY (id)`
- `UNIQUE (office_code)`
- `idx_offices_state (state)`
- `idx_offices_region (region)`
- `idx_offices_coords (latitude, longitude)`
- `idx_offices_county (county)`

**Relationships:**
- Referenced by `advisories.office_id`, `office_status.office_id`, `advisory_history.office_id`, `office_observations.office_id`

---

## advisories

**Purpose:** Weather alerts and warnings currently active or recently expired, matched to specific offices by UGC zone codes. The core operational table — populated and maintained by the NOAA ingestion pipeline.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | INT AUTO_INCREMENT | No | Internal primary key |
| `external_id` | VARCHAR(255) | Yes | NOAA alert ID (URN format); unique per NOAA alert object |
| `office_id` | INT | No | FK → `offices.id`; office this advisory applies to |
| `advisory_type` | VARCHAR(100) | No | NOAA alert event type string (e.g. `Hurricane Warning`, `Winter Storm Watch`) |
| `severity` | VARCHAR(50) | No | NOAA severity classification: `Extreme`, `Severe`, `Moderate`, or `Minor` |
| `status` | VARCHAR(20) | No | Lifecycle state: `active`, `expired`, `cancelled`. Default: `active` |
| `source` | VARCHAR(100) | No | Data source identifier (e.g. `NOAA`, `NWS`, `State Emergency`) |
| `headline` | VARCHAR(500) | Yes | Short summary headline from NOAA |
| `description` | TEXT | Yes | Full advisory narrative text |
| `start_time` | DATETIME | Yes | Advisory effective start time |
| `end_time` | DATETIME | Yes | Advisory expiration time |
| `issued_time` | DATETIME | Yes | When NWS issued this alert |
| `last_updated` | DATETIME | No | Auto-updated on every row modification |
| `vtec_code` | VARCHAR(255) | Yes | Full VTEC string from NOAA (e.g. `/O.NEW.PAJK.BZ.W.0006.260308T1000Z-260309T0200Z/`) |
| `vtec_event_id` | VARCHAR(50) | Yes | Persistent event identifier: `OFFICE.PHENOM.SIG.EVENT` (e.g. `PAJK.BZ.W.0006`). Stable across updates to the same event. |
| `vtec_action` | VARCHAR(10) | Yes | VTEC action code: `NEW`, `CON`, `EXT`, `UPG`, `EXP`, `CAN`, `COR` |
| `vtec_event_unique_key` | VARCHAR(600) GENERATED STORED | Yes | Computed uniqueness key: `vtec_event_id|office_id|advisory_type` when `status='active'` and `vtec_event_id` is set; NULL otherwise. Prevents duplicate active VTEC events per office. |
| `raw_payload` | TEXT | Yes | JSON string of the original NOAA API payload, retained for debugging |

**Severity enumeration** (enforced by CHECK constraint):
- `Extreme` — life-threatening, immediate action required
- `Severe` — significant impact, take protective action
- `Moderate` — some impact, be prepared
- `Minor` — minimal impact, stay informed

**VTEC action codes:**
- `NEW` — new alert issued
- `CON` — alert continuing unchanged
- `EXT` — alert time extended
- `UPG` — alert upgraded in severity
- `EXP` — alert has expired
- `CAN` — alert cancelled before expiration
- `COR` — correction to a previously issued alert

**Indexes:**
- `PRIMARY KEY (id)`
- `UNIQUE idx_advisories_external_office (external_id, office_id)` — prevents duplicate ingestion of the same NOAA alert per office
- `UNIQUE idx_vtec_event_unique_active (vtec_event_unique_key)` — prevents duplicate active VTEC events per office
- `idx_advisories_office (office_id)`
- `idx_advisories_status (status)`
- `idx_advisories_severity (severity)`
- `idx_advisories_status_severity (status, severity)`
- `idx_advisories_time (start_time, end_time)`
- `idx_advisories_status_time (status, start_time, end_time)`
- `idx_advisories_office_status (office_id, status)`
- `idx_advisories_office_severity (office_id, severity)`
- `idx_advisories_office_status_endtime (office_id, status, end_time)`
- `idx_vtec_event_id (vtec_event_id)`
- `idx_advisories_vtec_office_status (vtec_event_id, office_id, status)`
- `idx_advisories_status_updated (status, last_updated)`
- `idx_vtec_action (vtec_action)`

**Relationships:**
- `office_id` → `offices.id` ON DELETE CASCADE
- `advisory_type` references `alert_types.type_name` at the application layer (no DB FK — MariaDB forbids FK on columns used in GENERATED ALWAYS AS expressions)

---

## advisory_history

**Purpose:** Point-in-time snapshots of per-office advisory state, captured after each ingestion cycle. Used for trend analysis and sparkline charts on the frontend.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | INT AUTO_INCREMENT | No | Internal primary key |
| `office_id` | INT | No | FK → `offices.id` |
| `snapshot_time` | DATETIME | No | When this snapshot was recorded |
| `advisory_count` | INT | Yes | Total active advisories for this office at snapshot time. Default: 0 |
| `highest_severity` | VARCHAR(50) | Yes | Highest severity among active advisories at snapshot time |
| `highest_severity_type` | VARCHAR(100) | Yes | Advisory type of the highest-severity alert |
| `has_extreme` | BOOLEAN | Yes | True if any active advisory had `Extreme` severity. Default: FALSE |
| `has_severe` | BOOLEAN | Yes | True if any active advisory had `Severe` severity. Default: FALSE |
| `has_moderate` | BOOLEAN | Yes | True if any active advisory had `Moderate` severity. Default: FALSE |
| `new_count` | INT | Yes | Count of advisories with VTEC action `NEW` at snapshot time. Default: 0 |
| `upgrade_count` | INT | Yes | Count of advisories with VTEC action `UPG` at snapshot time. Default: 0 |
| `advisory_snapshot` | TEXT | Yes | JSON snapshot of the full advisory list at this point in time, for detailed trend reconstruction |
| `created_at` | DATETIME | No | Row creation timestamp (auto-set) |

**Indexes:**
- `PRIMARY KEY (id)`
- `idx_advisory_history_office (office_id)`
- `idx_advisory_history_time (snapshot_time)`
- `idx_advisory_history_office_time (office_id, snapshot_time)`

**Relationships:**
- `office_id` → `offices.id` ON DELETE CASCADE

---

## office_status

**Purpose:** Operational status of each office. Two independent status tracks are maintained: `operational_status` (set by operations staff) and `weather_impact_level` (set automatically by the ingestion pipeline based on advisory severity).

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | INT AUTO_INCREMENT | No | Internal primary key |
| `office_id` | INT | No | FK → `offices.id`; UNIQUE — one status row per office |
| `operational_status` | VARCHAR(20) | No | Operational state set by operations team. Default: `open_normal` |
| `weather_impact_level` | VARCHAR(20) | Yes | Weather impact level auto-calculated by ingestion. Default: `green` |
| `reason` | TEXT | Yes | Legacy free-text reason for current status |
| `decision_by` | VARCHAR(100) | Yes | Who made the most recent operational decision |
| `decision_at` | DATETIME | Yes | When the operational decision was made |
| `decision_reason` | TEXT | Yes | Reason provided for the operational decision |
| `last_updated` | DATETIME | No | Auto-updated on modification |

**Operational status enumeration:**
- `open_normal` — operating normally
- `open_restricted` — open with reduced capacity or hours
- `pending` — status determination in progress
- `closed` — closed due to weather or other event

**Weather impact level enumeration:**
- `green` — no active advisories
- `yellow` — Minor severity advisory active
- `orange` — Moderate severity advisory active
- `red` — Severe or Extreme severity advisory active

**Indexes:**
- `PRIMARY KEY (id)`
- `UNIQUE (office_id)`
- `idx_office_status_status (operational_status)`
- `idx_office_status_weather (weather_impact_level)`

**Relationships:**
- `office_id` → `offices.id` ON DELETE CASCADE

---

## notices

**Purpose:** Government and emergency notices that may affect operations, such as state emergency declarations, evacuation orders, and federal disaster declarations. Manually curated; not ingested automatically.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | INT AUTO_INCREMENT | No | Internal primary key |
| `jurisdiction` | VARCHAR(100) | No | Issuing jurisdiction (e.g. `State of Florida`, `Harris County, TX`) |
| `jurisdiction_type` | VARCHAR(50) | Yes | Type of jurisdiction |
| `notice_type` | VARCHAR(100) | No | Notice category (e.g. `Emergency Declaration`, `Evacuation Order`) |
| `title` | VARCHAR(500) | No | Notice title |
| `description` | TEXT | Yes | Full notice text |
| `affected_states` | TEXT | Yes | Comma-separated 2-letter state codes |
| `effective_time` | DATETIME | Yes | When the notice takes effect |
| `expiration_time` | DATETIME | Yes | When the notice expires |
| `source_url` | TEXT | Yes | URL to the official notice source |
| `last_updated` | DATETIME | No | Auto-updated on modification |

**Jurisdiction type enumeration:**
- `Federal`
- `State`
- `County`
- `City`

**Indexes:**
- `PRIMARY KEY (id)`
- `idx_notices_jurisdiction (jurisdiction)`
- `idx_notices_type (notice_type)`
- `idx_notices_effective (effective_time, expiration_time)`

---

## office_observations

**Purpose:** Current weather conditions for each office, sourced from the nearest NWS observation station. One row per office; replaced (UPSERT) on every ingestion cycle. All measurements stored in SI units; the API layer converts to imperial for frontend display.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | INT AUTO_INCREMENT | No | Internal primary key |
| `office_id` | INT | No | FK → `offices.id`; UNIQUE — one observation row per office |
| `station_id` | VARCHAR(10) | No | ICAO station code (e.g. `KORD`, `PANC`) |
| `temperature_c` | DECIMAL(5,2) | Yes | Air temperature in degrees Celsius |
| `relative_humidity` | DECIMAL(5,2) | Yes | Relative humidity as percentage (0–100) |
| `dewpoint_c` | DECIMAL(5,2) | Yes | Dew point temperature in degrees Celsius |
| `wind_speed_kmh` | DECIMAL(6,2) | Yes | Wind speed in km/h |
| `wind_direction_deg` | INT | Yes | Wind direction in degrees (0–360; 0 = north) |
| `wind_gust_kmh` | DECIMAL(6,2) | Yes | Wind gust speed in km/h |
| `barometric_pressure_pa` | DECIMAL(10,2) | Yes | Barometric pressure in Pascals |
| `visibility_m` | DECIMAL(10,2) | Yes | Visibility in meters |
| `wind_chill_c` | DECIMAL(5,2) | Yes | Wind chill temperature in degrees Celsius |
| `heat_index_c` | DECIMAL(5,2) | Yes | Heat index temperature in degrees Celsius |
| `cloud_layers` | TEXT | Yes | JSON string of cloud layer data from NOAA observation |
| `text_description` | VARCHAR(255) | Yes | Human-readable weather description (e.g. `Cloudy`, `Partly Sunny`) |
| `observed_at` | DATETIME | Yes | When the station recorded this observation |
| `ingested_at` | DATETIME | No | When this row was written to the database (auto-set) |

**Indexes:**
- `PRIMARY KEY (id)`
- `UNIQUE idx_office_observations_office (office_id)` — one row per office; enables efficient UPSERT
- `idx_office_observations_station (station_id)`

**Relationships:**
- `office_id` → `offices.id` ON DELETE CASCADE

---

## system_snapshots

**Purpose:** System-wide aggregate metrics captured every 6 hours. Retained for 3 days (12 snapshots). Provides faster trend queries than aggregating `advisory_history` directly — avoids full-table scans for dashboard sparklines.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | INT AUTO_INCREMENT | No | Internal primary key |
| `snapshot_time` | DATETIME | No | When this snapshot was captured; UNIQUE |
| `extreme_count` | INT | Yes | Count of active Extreme severity advisories. Default: 0 |
| `severe_count` | INT | Yes | Count of active Severe severity advisories. Default: 0 |
| `moderate_count` | INT | Yes | Count of active Moderate severity advisories. Default: 0 |
| `minor_count` | INT | Yes | Count of active Minor severity advisories. Default: 0 |
| `offices_red` | INT | Yes | Count of offices with `weather_impact_level = red`. Default: 0 |
| `offices_orange` | INT | Yes | Count of offices with `weather_impact_level = orange`. Default: 0 |
| `offices_yellow` | INT | Yes | Count of offices with `weather_impact_level = yellow`. Default: 0 |
| `offices_green` | INT | Yes | Count of offices with `weather_impact_level = green`. Default: 0 |
| `offices_closed` | INT | Yes | Count of offices with `operational_status = closed`. Default: 0 |
| `offices_restricted` | INT | Yes | Count of offices with `operational_status = open_restricted`. Default: 0 |
| `offices_pending` | INT | Yes | Count of offices with `operational_status = pending`. Default: 0 |
| `offices_open` | INT | Yes | Count of offices with `operational_status = open_normal`. Default: 0 |
| `new_advisories` | INT | Yes | Count of advisories with VTEC action `NEW`. Default: 0 |
| `continued_advisories` | INT | Yes | Count of advisories with VTEC action `CON`. Default: 0 |
| `upgraded_advisories` | INT | Yes | Count of advisories with VTEC action `UPG`. Default: 0 |
| `total_advisories` | INT | Yes | Total active advisory count across all offices. Default: 0 |
| `total_offices_with_advisories` | INT | Yes | Count of offices with at least one active advisory. Default: 0 |
| `created_at` | DATETIME | No | Row creation timestamp (auto-set) |

**Indexes:**
- `PRIMARY KEY (id)`
- `UNIQUE (snapshot_time)`
- `idx_system_snapshots_time (snapshot_time)`

**Retention:** 3 days (12 snapshots). Older rows are pruned automatically.

---

## alert_types

**Purpose:** Lookup table of all known NOAA weather alert event types and their impact category. Referenced by `advisories.advisory_type` at the application layer. Unknown types encountered during ingestion are auto-registered with `category = 'UNKNOWN'`.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `type_name` | VARCHAR(100) | No | NOAA event type string (e.g. `Tornado Warning`, `Winter Storm Watch`). Primary key. |
| `category` | ENUM | No | Impact level classification. Default: `UNKNOWN` |

**Category enumeration:**
- `CRITICAL` — 13 types; life-threatening, immediate danger (e.g. Tornado Warning, Hurricane Warning, Blizzard Warning)
- `HIGH` — 17 types; significant impact requiring protective action (e.g. Tornado Watch, Flood Warning, Winter Storm Warning)
- `MODERATE` — 23 types; notable impact requiring preparation (e.g. Winter Weather Advisory, Dense Fog Advisory, Freeze Warning)
- `LOW` — 23 types; minor impact (e.g. Wind Chill Advisory, Coastal Flood Advisory, Air Quality Alert)
- `INFO` — 18 types; informational or administrative (e.g. Special Weather Statement, Hazardous Weather Outlook)
- `UNKNOWN` — types not in the pre-seeded taxonomy; auto-registered by the ingestor

**Indexes:**
- `PRIMARY KEY (type_name)`

**Notes:**
- 94 pre-seeded types covering the full official NOAA alert taxonomy as of 2026
- No FK from `advisories.advisory_type` due to MariaDB restriction on FKs referencing columns used in GENERATED ALWAYS AS expressions (see schema comment in `advisories` table)
- Application-layer enforcement: ingestor runs `INSERT IGNORE INTO alert_types` before every advisory insert

---

## schema_migrations

**Purpose:** Tracks which forward migration scripts have been applied to this database instance. Managed by `node src/scripts/run-migrations.js`. Prevents migrations from being applied more than once.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `filename` | VARCHAR(255) | No | Migration filename (e.g. `20260220-add-decision-fields.sql`). Primary key. |
| `applied_at` | DATETIME | No | When this migration was applied. Default: CURRENT_TIMESTAMP |

**Indexes:**
- `PRIMARY KEY (filename)`

**Notes:**
- Migration files live in `backend/src/data/migrations/` and are applied in filename (lexicographic) order
- To check migration status: `node src/scripts/run-migrations.js --status`
- To roll back: manually revert the schema change and delete the row from this table (see `DEPLOY.md` for rollback procedure)

---

## Relationships Summary

```
offices (1) ──< advisories (many)
offices (1) ──< advisory_history (many)
offices (1) ──1 office_status
offices (1) ──1 office_observations
advisories.advisory_type >── alert_types.type_name  [application-layer only]
```

All child tables use `ON DELETE CASCADE` — deleting an office removes all related advisories, history, status, and observation rows.
