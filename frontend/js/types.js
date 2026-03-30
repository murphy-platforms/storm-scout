/**
 * Storm Scout — Frontend Type Definitions
 *
 * Simplified @typedef declarations for API response shapes consumed by
 * frontend scripts. This file exports nothing at runtime.
 *
 * @generated AI-authored (Claude) — vanilla JS by design
 */

// ──────────────────────────────────────────────
// API Response Shapes
// ──────────────────────────────────────────────

/**
 * Advisory as returned by the /api/advisories endpoints.
 * @typedef {Object} Advisory
 * @property {number}      id
 * @property {string}      external_id
 * @property {number}      office_id
 * @property {string}      advisory_type
 * @property {string}      severity          - "Extreme" | "Severe" | "Moderate" | "Minor" | "Unknown"
 * @property {string}      status            - "active" | "expired"
 * @property {string|null} headline
 * @property {string|null} description
 * @property {string|null} start_time
 * @property {string|null} end_time
 * @property {string|null} issued_time
 * @property {string|null} vtec_action       - "NEW" | "CON" | "EXT" | "UPG" | "EXP" | etc.
 * @property {string}      last_updated
 * @property {string}      source
 * @property {string}      office_code
 * @property {string}      office_name
 * @property {string}      city
 * @property {string}      state
 * @property {string}      [region]
 */

/**
 * Office as returned by the /api/offices endpoint.
 * @typedef {Object} Office
 * @property {number}      id
 * @property {string}      office_code
 * @property {string}      name
 * @property {string}      city
 * @property {string}      state
 * @property {string|null} region
 * @property {number}      latitude
 * @property {number}      longitude
 */

/**
 * Impacted office as returned by /api/status/offices-impacted.
 * @typedef {Object} ImpactedOffice
 * @property {number}      office_id
 * @property {string}      operational_status
 * @property {string|null} weather_impact_level
 * @property {string}      office_code
 * @property {string}      name
 * @property {string}      city
 * @property {string}      state
 * @property {string|null} region
 * @property {number}      advisory_count
 */

/**
 * Notice as returned by /api/notices/active.
 * @typedef {Object} Notice
 * @property {number}      id
 * @property {string}      notice_type
 * @property {string}      jurisdiction_type
 * @property {string|null} jurisdiction
 * @property {string|null} headline
 * @property {string|null} description
 * @property {string}      effective_time
 * @property {string|null} expiration_time
 */

/**
 * Weather observation as returned by /api/observations.
 * @typedef {Object} Observation
 * @property {number}      office_id
 * @property {string}      station_id
 * @property {number|null} temperature_c
 * @property {number|null} relative_humidity
 * @property {number|null} wind_speed_kmh
 * @property {number|null} wind_direction_deg
 * @property {string|null} text_description
 * @property {string|null} observed_at
 * @property {string}      office_code
 * @property {string}      office_name
 * @property {string}      city
 * @property {string}      state
 */

/**
 * Dashboard overview data from /api/status/overview.
 * @typedef {Object} OverviewData
 * @property {number}  total_offices
 * @property {number}  impacted_offices
 * @property {number}  active_advisories
 * @property {Array<{severity: string, count: number}>} severity_counts
 * @property {Array<{operational_status: string, count: number}>} status_counts
 * @property {[key: string]: unknown} [additional] - Additional dynamic fields
 */

/**
 * Timing metadata from /api/status/timing.
 * @typedef {Object} TimingData
 * @property {string}      lastIngestion     - ISO datetime of last successful ingestion
 * @property {string|null} nextIngestion     - ISO datetime of next scheduled ingestion
 * @property {number}      intervalMinutes   - Ingestion interval in minutes
 */

/**
 * Version info from /api/version.
 * @typedef {Object} VersionInfo
 * @property {string} version
 * @property {string} releaseDate
 * @property {string} [environment]
 */

// ──────────────────────────────────────────────
// Aggregation Types (used by aggregation.js)
// ──────────────────────────────────────────────

/**
 * Advisory after multi-zone deduplication.
 * @typedef {Advisory & DeduplicatedFields} DeduplicatedAdvisory
 */

/**
 * @typedef {Object} DeduplicatedFields
 * @property {boolean}  is_representative
 * @property {number}   zone_count
 * @property {string[]} zones
 * @property {number[]} related_ids
 * @property {number}   highest_urgency
 */

/**
 * Office aggregation produced by OfficeAggregator.aggregateByOffice().
 * @typedef {Object} AggregatedOffice
 * @property {number}              office_id
 * @property {string}              office_code
 * @property {string}              office_name
 * @property {string}              city
 * @property {string}              state
 * @property {Array<Advisory|DeduplicatedAdvisory>} advisories
 * @property {string|null}         highest_severity
 * @property {number}              highest_severity_rank
 * @property {string[]}            unique_types
 * @property {number}              total_zone_count
 * @property {number}              unique_advisory_count
 * @property {number}              new_count
 * @property {number}              continued_count
 * @property {number}              urgency_score
 * @property {Array<TypeGroup>}    type_groups
 * @property {Advisory|null}       highest_severity_advisory
 */

/**
 * Advisory type group within an aggregated office.
 * @typedef {Object} TypeGroup
 * @property {string}  type
 * @property {string}  severity
 * @property {number}  count
 * @property {number}  zone_count
 * @property {string|null} expires
 * @property {string|null} vtec_action
 * @property {Advisory} representative
 */

/**
 * Severity-grouped offices from OfficeAggregator.groupBySeverity().
 * @typedef {Object} SeverityGroups
 * @property {AggregatedOffice[]} extreme
 * @property {AggregatedOffice[]} severe
 * @property {AggregatedOffice[]} moderate
 * @property {AggregatedOffice[]} minor
 */

/**
 * Summary statistics from OfficeAggregator.getSummaryStats().
 * @typedef {Object} SummaryStats
 * @property {number}       total_advisories
 * @property {number}       unique_offices
 * @property {number}       extreme_severe_offices
 * @property {number}       moderate_offices
 * @property {number}       minor_offices
 * @property {number}       new_alerts
 * @property {number|string} avg_alerts_per_office
 */

/**
 * Filter warning from OfficeAggregator.getFilterWarning().
 * @typedef {Object} FilterWarning
 * @property {number}  hidden_count
 * @property {number}  critical_hidden
 * @property {boolean} has_critical
 * @property {boolean} all_hidden
 */
