/**
 * Storm Scout — Backend Type Definitions
 *
 * Pure @typedef declarations consumed via JSDoc {@link import} references.
 * This file exports nothing at runtime — it exists only for editor
 * intellisense and `checkJs` type checking.
 *
 * @generated AI-authored (Claude) — vanilla JS by design
 */

// ──────────────────────────────────────────────
// Advisory
// ──────────────────────────────────────────────

/**
 * @typedef {Object} Advisory
 * @property {number}      id
 * @property {string}      external_id       - NOAA unique identifier for the alert
 * @property {number}      office_id         - FK to offices.id
 * @property {string}      advisory_type     - e.g. "Tornado Warning", "Winter Storm Watch"
 * @property {string}      severity          - "Extreme" | "Severe" | "Moderate" | "Minor" | "Unknown"
 * @property {string}      status            - "active" | "expired"
 * @property {string}      source            - Originating zone/area identifier
 * @property {string|null} headline
 * @property {string|null} description
 * @property {string|null} start_time        - ISO datetime
 * @property {string|null} end_time          - ISO datetime
 * @property {string|null} issued_time       - ISO datetime
 * @property {string|null} vtec_code         - Raw VTEC string (legacy)
 * @property {string|null} vtec_event_id     - Persistent VTEC event ID (e.g. "PAJK.HW.W.0006")
 * @property {string|null} vtec_action       - "NEW" | "CON" | "EXT" | "UPG" | "EXP" | etc.
 * @property {string|Object|null} raw_payload - Original NOAA JSON payload
 * @property {string}      last_updated      - ISO datetime (auto-set by DB)
 */

/**
 * Advisory joined with office data (returned by getAll, getById, etc.)
 * @typedef {Advisory & AdvisoryOfficeJoin} AdvisoryWithOffice
 */

/**
 * @typedef {Object} AdvisoryOfficeJoin
 * @property {string} office_code
 * @property {string} office_name
 * @property {string} city
 * @property {string} state
 * @property {string} [region]
 */

/**
 * Filters accepted by AdvisoryModel.getAll()
 * @typedef {Object} AdvisoryFilters
 * @property {string}        [status]        - "active" | "expired"
 * @property {string|string[]} [severity]    - Single value or comma-separated / array
 * @property {string|string[]} [advisory_type] - Single value or comma-separated / array
 * @property {string}        [state]         - Two-letter state code
 * @property {number}        [office_id]
 */

/**
 * Pre-fetched lookup maps passed to AdvisoryModel.create() to skip per-row SELECTs.
 * @typedef {Object} AdvisoryExistingLookup
 * @property {Map<string, Advisory>} byExternalId - key: `${external_id}|${office_id}`
 */

// ──────────────────────────────────────────────
// Office
// ──────────────────────────────────────────────

/**
 * @typedef {Object} Office
 * @property {number}      id
 * @property {string}      office_code        - Unique office identifier (e.g. 5-digit zip)
 * @property {string}      name
 * @property {string}      city
 * @property {string}      state              - Two-letter state code
 * @property {string|null} region
 * @property {number}      latitude
 * @property {number}      longitude
 * @property {string|null} county
 * @property {string|null} ugc_codes          - JSON array of UGC zone codes
 * @property {string|null} observation_station - NWS observation station ID
 */

// ──────────────────────────────────────────────
// OfficeStatus
// ──────────────────────────────────────────────

/**
 * @typedef {Object} OfficeStatus
 * @property {number}      office_id
 * @property {string}      operational_status    - "open_normal" | "open_restricted" | "closed" | "pending" (or legacy "Open" | "Closed" | "At Risk")
 * @property {string|null} weather_impact_level  - "green" | "yellow" | "orange" | "red"
 * @property {string|null} reason                - Legacy reason text
 * @property {string|null} decision_by           - Who made the operational decision
 * @property {string|null} decision_reason       - Reason for the operational decision
 * @property {string|null} decision_at           - ISO datetime of the decision
 * @property {string}      last_updated          - ISO datetime
 */

/**
 * OfficeStatus joined with office data (returned by getAll, getByOffice, etc.)
 * @typedef {OfficeStatus & OfficeStatusOfficeJoin} OfficeStatusWithOffice
 */

/**
 * @typedef {Object} OfficeStatusOfficeJoin
 * @property {string}      office_code
 * @property {string}      name
 * @property {string}      city
 * @property {string}      state
 * @property {string|null} region
 * @property {number}      [latitude]
 * @property {number}      [longitude]
 */

/**
 * Data accepted by OfficeStatusModel.upsert()
 * @typedef {Object} OfficeStatusData
 * @property {string} [operational_status]    - "open_normal" | "open_restricted" | "closed" | "pending"
 * @property {string} [weather_impact_level]  - "green" | "yellow" | "orange" | "red"
 * @property {string} [reason]
 * @property {string} [decision_by]
 * @property {string} [decision_reason]
 */

// ──────────────────────────────────────────────
// Notice
// ──────────────────────────────────────────────

/**
 * @typedef {Object} Notice
 * @property {number}      id
 * @property {string}      notice_type          - e.g. "Emergency Declaration", "Local Closure"
 * @property {string}      jurisdiction_type    - "Federal" | "State" | "Local"
 * @property {string|null} jurisdiction         - Two-letter state code or other identifier
 * @property {string|null} headline
 * @property {string|null} description
 * @property {string}      effective_time       - ISO datetime
 * @property {string|null} expiration_time      - ISO datetime (null = no expiry)
 * @property {string}      [created_at]
 * @property {string}      [updated_at]
 */

// ──────────────────────────────────────────────
// Observation
// ──────────────────────────────────────────────

/**
 * @typedef {Object} Observation
 * @property {number}      office_id
 * @property {string}      station_id           - NWS observation station ID
 * @property {number|null} temperature_c
 * @property {number|null} relative_humidity
 * @property {number|null} dewpoint_c
 * @property {number|null} wind_speed_kmh
 * @property {number|null} wind_direction_deg
 * @property {number|null} wind_gust_kmh
 * @property {number|null} barometric_pressure_pa
 * @property {number|null} visibility_m
 * @property {number|null} wind_chill_c
 * @property {number|null} heat_index_c
 * @property {string|null} cloud_layers         - JSON string of cloud layer data
 * @property {string|null} text_description
 * @property {string|null} observed_at          - ISO datetime
 * @property {string}      ingested_at          - ISO datetime (auto-set by DB)
 */

/**
 * Observation data accepted by ObservationModel.upsert()
 * @typedef {Object} ObservationData
 * @property {string}      station_id
 * @property {number|null} temperature_c
 * @property {number|null} relative_humidity
 * @property {number|null} dewpoint_c
 * @property {number|null} wind_speed_kmh
 * @property {number|null} wind_direction_deg
 * @property {number|null} wind_gust_kmh
 * @property {number|null} barometric_pressure_pa
 * @property {number|null} visibility_m
 * @property {number|null} wind_chill_c
 * @property {number|null} heat_index_c
 * @property {string|null} cloud_layers
 * @property {string|null} text_description
 * @property {Date|null}   observed_at
 */

// ──────────────────────────────────────────────
// AdvisoryHistory
// ──────────────────────────────────────────────

/**
 * A single advisory_history row (periodic snapshot of office advisory state).
 * @typedef {Object} AdvisoryHistorySnapshot
 * @property {number}      id
 * @property {number}      office_id
 * @property {string}      snapshot_time         - ISO datetime
 * @property {number}      advisory_count
 * @property {string|null} highest_severity      - "Extreme" | "Severe" | "Moderate" | "Minor"
 * @property {string|null} highest_severity_type - Advisory type of the highest severity alert
 * @property {boolean}     has_extreme
 * @property {boolean}     has_severe
 * @property {boolean}     has_moderate
 * @property {number}      new_count             - Number of NEW VTEC actions
 * @property {number}      upgrade_count         - Number of UPG VTEC actions
 * @property {string}      advisory_snapshot     - JSON blob of advisory summaries
 */

/**
 * Aggregated data passed to AdvisoryHistory.createSnapshot()
 * @typedef {Object} AggregatedSnapshotData
 * @property {number}    advisory_count
 * @property {string}    highest_severity
 * @property {string}    highest_severity_type
 * @property {boolean}   has_extreme
 * @property {boolean}   has_severe
 * @property {boolean}   has_moderate
 * @property {number}    new_count
 * @property {number}    upgrade_count
 * @property {Array<Advisory>} advisories
 */

/**
 * Trend summary returned by AdvisoryHistory.getTrend()
 * @typedef {Object} AdvisoryTrend
 * @property {string}  trend              - "worsening" | "improving" | "stable" | "insufficient_data"
 * @property {number}  [severity_change]
 * @property {number}  [advisory_change]
 * @property {string}  [first_severity]
 * @property {string}  [last_severity]
 * @property {number}  [first_count]
 * @property {number}  [last_count]
 * @property {number}  [duration_hours]
 * @property {Array<AdvisoryHistorySnapshot>} history
 */

// ──────────────────────────────────────────────
// Ingestion
// ──────────────────────────────────────────────

/**
 * Result returned by ingestNOAAData()
 * @typedef {Object} IngestionResult
 * @property {string} status              - "success" | "partial"
 * @property {number} advisoriesCreated
 * @property {number} advisoriesFailed
 * @property {number} statusesUpdated
 * @property {number} statusesFailed
 * @property {number} expiredCount
 * @property {number} expiredRemoved
 * @property {number} observationsUpdated
 * @property {number} observationsTotal
 */

/**
 * Result returned by ingestObservations()
 * @typedef {Object} ObservationIngestionResult
 * @property {number} total
 * @property {number} updated
 * @property {number} failed
 * @property {number} uniqueStations
 */

/**
 * Geographic identifiers extracted from a NOAA alert
 * @typedef {Object} AlertGeoData
 * @property {string[]} ugcCodes
 * @property {string[]} counties   - Format: "STATE|countyname"
 * @property {string[]} states     - Two-letter state codes
 */
