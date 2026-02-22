# Changelog

All notable changes to Storm Scout will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Historical data API endpoints for trend retrieval
- Trend visualization dashboards
- Predictive analytics based on historical patterns
- Unit tests with Jest
- Database backup automation

## [1.7.2] - 2026-02-22

### Changed
- **Card View Default Sort** - Card view on advisories page now defaults to site code ascending, matching table view (closes #56)
- **Grouped Table View** - Table view on advisories page now groups alerts by site instead of showing flat duplicate-looking rows (closes #55)
  - Site header rows show site code, name, city/state, temperature, alert count, and highest severity badge
  - Alert sub-rows beneath each header show headline, advisory type, severity, action, source, and last updated
  - Header rows are clickable and navigate to site detail page
  - Severity-colored left border on header rows matches card view styling (red/orange/yellow/green)
  - Dedup toggle and all filters continue to work with grouped view
  - Summary stats now update correctly when filters change in table view

## [1.7.1] - 2026-02-22

### Changed
- **Total Impact Card** - Replaced "Low/No Impact" (green) card with "Total Impact" aggregate card in Weather Impact Assessment (closes #53)
  - Displays sum of High Impact + Severe Impact + Moderate Impact site counts
  - Navy-styled card using Prometric brand color (`--pm-navy`)
  - Links to `sites.html` showing all impacted sites
- **Weather Impact Card Order** - Reordered cards: Total Impact → High Impact → Severe Impact → Moderate Impact (closes #54)

## [1.7.0] - 2026-02-21

### Changed
- **Prometric Visual Alignment** - Updated color palette and design elements to align with Prometric brand identity
  - Added Prometric brand CSS variables: `--pm-navy` (#1B2845), `--pm-green` (#7AB648), `--pm-text` (#313131) (closes #41)
  - Navbar changed from Bootstrap black to deep navy across all 8 pages (closes #42)
  - Sticky update banner on dashboard changed to navy background (closes #43)
  - Body text color updated to Prometric charcoal #313131 (closes #44)
  - Section headings (h1-h4) now use deep navy tint (closes #45)
  - Primary buttons changed from Bootstrap blue to Prometric green; outline-primary buttons follow suit (closes #46)
  - All interactive accent colors in style.css updated from Bootstrap blue to navy/green variables (closes #47)
  - Tooltip hover/focus accents updated to navy in tooltips.css (closes #48)
  - Mobile focus-visible outline and skip-to-content updated to navy in mobile.css (closes #49)
  - Export report templates (incident, summary, executive) accent colors updated to navy (closes #50)
  - Footer changed from light gray to dark navy background with light text across all 8 pages (closes #51)
- Severity indicator colors (red/orange/yellow/green) intentionally unchanged — critical operational signals

## [1.6.4] - 2026-02-21

### Added
- **Dynamic Critical/Severe Count Color** - Summary stats bar on advisories page now shows count in red when Extreme alerts are present, orange when only Severe (closes #14)
- **Alert Headline on Site Cards** - NOAA alert headline displayed on each site card below advisory type, truncated to 120 chars (closes #15)
- **Temperature + Station Status on Site Cards** - Current temperature (°F/°C) from nearest NWS station shown on cards with relative timestamp; stations older than 90 minutes display "OFFLINE" in red (closes #16)
- **Temperature Column in Table View** - New Temp column between Site Code and Site Name in advisories table view (closes #17)
- **Headline Column in Table View** - New Headline column between Site Name and City in advisories table view, truncated to 80 chars (closes #18)
- **Celsius Added to Temperature** - All temperature displays now show °F / °C (closes #20, closes #21)
- **Temperature on Dashboard Cards** - index.html site cards now show temperature in header below severity badge (closes #22)
- **Headline on Dashboard Cards** - index.html site cards now show NOAA alert headline below advisory type (closes #23)
- **Temperature on Sites Cards** - sites.html cards restructured with city/state in header + temperature below severity badge (closes #24)
- **Headline on Sites Cards** - sites.html cards now show NOAA alert headline below advisory type (closes #25)
- **Observations API Client** - Added `getObservations()` to frontend `api.js` for fetching current weather data
- **Temperature on Site Detail** - site-detail.html header card now shows temperature (°F/°C) below severity badge with staleness detection (closes #29)
- **Temperature on Map Popup** - map.html popup card now shows temperature (°F/°C) right-justified on city/state line with staleness detection (closes #30)
- **Headline on Map Popup** - map.html popup card now shows NOAA alert headline below severity badge, truncated to 80 chars (closes #31)

### Fixed
- **Map Popup View Details Button** - Button text was invisible due to Leaflet CSS overriding Bootstrap button color; added specificity fix (closes #32)

### Changed
- **Temperature Moved to Card Header** - Temperature display relocated from card body to header right side, below severity badge (closes #19)
- **API Rate Limit Increased** - General API rate limit raised from 500 to 5000 requests per 15 minutes to support additional observations API calls across all pages (closes #28)
- **Map Popup Layout Reorganized** - Removed "Highest Alert:" label (closes #33); moved NOAA alert type to display directly below severity/status badges (closes #34); alert type now bold (closes #35); headline grouped below alert type (closes #36)
- **Summary Panel Label** - Renamed "Sites Impacted" to "Locations Impacted" on advisories page (closes #37)
- **Critical/Severe Count Split** - Summary panel now shows separate color-coded counts for Critical (red) and Severe (orange) separated by "/" instead of a single combined number (closes #38)
- **Table View Default Sort** - Table view on advisories page now sorted by site code ascending (lowest to highest) as default; filters still apply before sort (closes #39)
- **Dashboard Layout Reorder** - Moved Weather Impact Assessment to top of dashboard, directly below heading and above Sites Requiring Attention (closes #40)

### Removed
- **City/State from Sites Card Body** - Moved to card header for consistency with advisories.html (closes #26)
- **Ops Status Badge from Sites Cards** - Removed unimplemented "Ops: Unknown" badge (closes #27)

## [1.6.3] - 2026-02-20

### Fixed
- **Site Data Verification** - Verified all 9 new sites against physical addresses from operations
  - 0383 Irving, TX: Corrected coordinates to 4441 W Airport Fwy (was city-center fallback)
  - 0624 Miami, FL: Corrected coordinates to 6505 Waterford District Dr / Blue Lagoon (was city-center); UGC zone updated FLZ173 → FLZ074
  - 5298 Wichita Falls, TX: Corrected coordinates to 4701 Southwest Pkwy (was geocoded to wrong address)
  - 6752 NYC Downtown, NY: Corrected coordinates to 80 Maiden Lane (was city-center fallback)
  - 5 remaining sites (0313, 1908, 1910, 3700, 3702) verified with no changes needed

### Removed
- **Site 6753 (NYC Downtown Testing Center 2)** - Removed as child site of 6752
  - Both sites share same physical address (80 Maiden Lane, Suite 706, New York, NY 10038)
  - Storm Scout tracks parent site codes only; total sites: 230 → 229

### Data Sources
- Coordinates verified via US Census Geocoder against operations-provided physical addresses
- NOAA /points API used to re-verify UGC codes, CWA, and county for all corrected sites
- Miami alternate address (6505 Blue Lagoon Dr) used when Waterford District Dr not in Census database

## [1.6.2] - 2026-02-20

### Added
- **10 New Testing Centers** - Total sites increased from 220 to 230
  - 0313 Waco, TX (McLennan County, FWD)
  - 0383 Irving, TX (Dallas County, FWD)
  - 0624 Miami, FL (Miami-Dade County, MFL)
  - 1908 Santa Fe, NM (Santa Fe County, ABQ)
  - 1910 Albuquerque, NM (Bernalillo County, ABQ)
  - 3700 Billings, MT (Yellowstone County, BYZ)
  - 3702 Helena, MT (Lewis and Clark County, TFX)
  - 5298 Wichita Falls, TX (Wichita County, OUN)
  - 6752 NYC Downtown, NY (New York County, OKX)
  - 6753 NYC Downtown 2, NY (New York County, OKX)
  - Montana added as new state (2 sites, Mountain region)
  - All sites include UGC codes, CWA, and county data
- **Add New Sites Script** (`backend/src/scripts/add-new-sites.js`)
  - Geocodes addresses via US Census Geocoder / Nominatim
  - Fetches UGC codes, CWA, and county from NOAA /points API
  - Generates sites.json entries and production SQL INSERT statements
  - Includes verification report with warnings for unconfirmed addresses

### Data Sources
- Addresses sourced from Prometric public test center lists (NCSF, DSST, ISEE/ERB PDFs)
- Coordinates from US Census Geocoder (6 sites) and Nominatim/OSM (4 sites)
- Weather data from NOAA Weather API /points endpoint

## [1.6.1] - 2026-02-19

### Added
- **New Site: Concord, NH (5148)** - 220th testing center added
  - Location: 2 Whitney Rd, Concord, NH 03301
  - UGC Codes: NHZ008, NHC013 (Merrimack County)
  - Region: Northeast
- **CWA Field** - Added NWS County Warning Area office code to all sites
  - New `cwa` column in sites table (e.g., "IND", "GYX", "MFL")
  - Populated for all 220 sites from NOAA /points API data
  - Stored in sites.json for future seeding

### Changed
- **NWS Forecast Links** - Updated from lat/lon MapClick to CWA office URLs
  - Old: `https://forecast.weather.gov/MapClick.php?lat=X&lon=Y`
  - New: `https://www.weather.gov/{cwa}` (e.g., `https://www.weather.gov/ind`)
  - Provides operations team with direct access to regional NWS office pages
  - Links include local forecasts, active alerts, and radar for the region

## [1.6.0] - 2026-02-15

### Removed
- **Beta UI** - Temporarily removed from production due to UI/UX bugs
  - Removed "Try Beta UI" nav link from all 8 Classic HTML pages
  - Removed footer Beta badge from index.html
  - Removed floating "Try Beta" button (`ui-toggle.js`)
  - Deleted `/beta/` directory from production server
  - Beta files archived locally to `frontend/archive/beta-2026-02-15/`

### Fixed
- **Weather Impact Drill-Down** - Dashboard Weather Impact cards now correctly filter Sites page
  - Added `weather_impact_level` calculation from `highest_severity` (Extreme→red, Severe→orange, Moderate→yellow, Minor→green)
  - Fixed race condition: URL parameters now applied after data loads (was using 100ms timeout)
  - Fixed data source: Changed from `API.getImpactedSites()` (3 closed sites) to `API.getSites()` (all 219 sites)
  - Fixed key mismatch: Sites API uses `id`, advisories use `site_id`
- **Export Dropdown** - Disabled broken Advanced Reports buttons
  - Executive Briefing, Incident Report, Export CSV marked as "Coming Soon"
  - Print/Save PDF and Copy Shareable Link still functional
  - Removed dead reference to archived `ui-toggle.js`
- **Dead Script References** - Removed obsolete `ui-toggle.js` script tags from 5 HTML files
  - Affected: map.html, site-detail.html, sources.html, filters.html, advisories.html
  - Script was archived with Beta UI but references remained
- **Severity Group Color Alignment** - Sites Requiring Attention now matches Weather Impact colors
  - Changed from 3-tier to 4-tier grouping (one per severity level)
  - 🔴 EXTREME - High Impact (previously combined with Severe as "critical")
  - 🟠 SEVERE - Severe Impact (previously combined with Extreme as "critical")
  - 🟡 MODERATE - Moderate Impact (was "elevated" displayed with orange)
  - 🟢 MINOR - Low Impact (was "monitoring" displayed with yellow)
  - Fixes visual inconsistency where Moderate alerts appeared orange in site groups but yellow in Weather Impact

### Verified
- **Frontend/API Mismatch Audit** - Comprehensive analysis of all frontend files
  - All 7 active HTML pages verified against backend API endpoints
  - ID matching logic confirmed correct (`id` vs `site_id` handling)
  - No broken API calls or missing endpoints found
  - All XSS-protected `html` tagged templates in place
  - All CDN resources have SRI hashes

### Security
- **CSP Compliance** - Fixed all inline event handlers blocked by `script-src-attr 'none'`
  - Replaced `onclick` attributes with `addEventListener` across 15 HTML files
  - Used event delegation for dynamically generated content
  - All pages now fully compliant with Content Security Policy

### Changed
- **IMT Severity Alignment** - Severity now based on internal alert categories instead of NOAA's raw severity
  - CRITICAL category → Extreme (🔴 RED)
  - HIGH category → Severe (🟠 ORANGE)
  - MODERATE category → Moderate (🟡 YELLOW)
  - LOW/INFO category → Minor (🟢 GREEN)
  - Example: Winter Storm Watch now shows as Moderate/Yellow (was Severe/Orange from NOAA)
  - Ran one-time database migration to update 126 existing alerts to new severity values
  - Aligns with IMT operational practices
- **Default Alert Filters** - Reduced Site Default from 19 to 11 enabled alert types
  - Added to disabled list: Lake Effect Snow Warning, Lake Effect Snow Watch, High Wind Watch,
    Coastal Flood Watch, Lakeshore Flood Watch, Excessive Heat Watch, Hard Freeze Warning, Freeze Watch
  - Site Default now focuses on most operationally relevant alerts

## [1.5.0] - 2026-02-14

### Added
- **API Rate Limiting** - Protects against abuse and ensures fair usage
  - General API: 5000 requests per 15 minutes per IP
  - Write operations: 20 requests per 15 minutes per IP
  - Health checks exempt from rate limiting
  - Returns 429 Too Many Requests with retry info when exceeded
  - Standard rate limit headers in responses
  - File: `middleware/rateLimiter.js`

- **Input Validation** - All API endpoints now validate and sanitize inputs
  - New `express-validator` middleware for all routes
  - Validates query params: severity, state, limit, days, etc.
  - Validates route params: id must be positive integer
  - Sanitizes strings: trim whitespace, uppercase state codes
  - Type coercion with range limits (e.g., limit 1-100)
  - Consistent 400 error responses with field-level details
  - Files: `middleware/validate.js`, `validators/*.js`

- **In-Memory Caching** - Reduces database load on high-traffic endpoints
  - New `cache.js` utility module using node-cache
  - Cached endpoints with TTL:
    - `/api/status/overview` - 15 min (matches ingestion interval)
    - `/api/sites` - 1 hour (static site data)
    - `/api/sites/states` - 24 hours (rarely changes)
    - `/api/sites/regions` - 24 hours (rarely changes)
    - `/api/advisories/active` - 15 min
  - Cache automatically invalidated after NOAA ingestion
  - Only caches unfiltered requests (filtered requests bypass cache)
  - Logging for cache hits/misses: `[CACHE] HIT/MISS/SET`

### Performance
- Expected ~100x faster response times for cached endpoints (~5ms vs ~500ms)
- Reduced database connection usage during traffic spikes
- Minimal memory footprint (~100KB for all cached data)

### Technical
- Added `node-cache` dependency
- New file: `backend/src/utils/cache.js`
- Modified: `status.js`, `sites.js`, `advisories.js`, `noaa-ingestor.js`

## [1.4.1] - 2026-02-14

### Added
- **Beta UI Notices Page** - Created `frontend/beta/notices.html` with full Beta UI styling
  - Jurisdiction filter dropdown (Federal, State, County, City)
  - Dark mode and high contrast support
  - Mobile responsive design
- **Self-Hosted Inter Font** (BUG-PROD-009) - Removed Google Fonts CDN dependency
  - Downloaded InterVariable.woff2 from official rsms/inter repository
  - Created `beta/css/fonts.css` with @font-face declarations
  - Eliminates external CDN dependency that could break typography
- **Google Analytics (GA4)** - Added tracking to all frontend pages (***REDACTED_GA_ID***)
  - Enables visitor analytics and usage monitoring
  - Added to all 8 HTML pages: index, advisories, sites, site-detail, map, notices, filters, sources

### Fixed
- **Severity Validation** (BUG-PROD-002) - `normalizer.js` now defaults invalid/Unknown severity to "Minor"
  - Logs warning when invalid severity received from NOAA
  - Prevents "Unknown" severity from breaking UI filters
- **Database Constraint** (BUG-PROD-008) - Added CHECK constraint `chk_advisories_severity`
  - Enforces severity IN ('Extreme', 'Severe', 'Moderate', 'Minor') at database level
  - Prevents invalid data from entering the system

### Performance
- **Composite Index** (BUG-PROD-005) - Added `idx_advisories_status_severity`
  - Improves queries filtering by both status AND severity
  - API response time improved from 676ms to 535ms (21% faster)

### Technical
- Migration: `20260214-add-severity-constraint-and-index.sql`
- Updated `schema.sql` with new index and constraint
- Self-hosted Inter font (352KB) in `beta/fonts/`

## [1.4.0] - 2026-02-14

### Added
- **Historical Snapshot System** - Automatic capture of system-wide and per-site metrics
  - `system_snapshots` table for system-wide aggregates (severity counts, site statuses, advisory actions)
  - `advisory_history` table for per-site historical snapshots
  - Snapshots captured every 6 hours, retained for 3 days (12 snapshots)
  - Automatic cleanup of data older than 3 days
  - Transaction-safe capture with rollback on failure
- **Snapshot Scheduler** - Integrated with main ingestion scheduler
  - Initial snapshot runs 5 seconds after server start
  - Recurring snapshots every 6 hours
  - Error handling with webhook notifications
  - Failure tracking and alerting

### Fixed
- **Database Connection Pattern** - Standardized across all models
  - Fixed `db.query is not a function` errors in all model files
  - Removed incorrect `await getDatabase()` calls (10+ instances in advisory.js, 8+ in site.js, 5+ in notice.js)
  - Fixed `advisoryHistory.js` to use `getDatabase()` correctly (5 query methods)
  - Fixed `capture-historical-snapshot.js` pool.getConnection() usage
- **Site Status Column Mismatch** - Fixed INSERT/UPDATE logic in siteStatus.js
  - Resolved "Column count doesn't match value count" errors during weather ingestion
  - Fixed `decision_at` handling to use NULL default in INSERT, NOW() in UPDATE
  - All 219 sites now update correctly during ingestion cycles
- **Module Caching** - Resolved Passenger cache issues
  - Implemented proper stop.txt → restart.txt cycle for complete module reload
  - Zero errors in production after complete restart

### Changed
- **Operational Status Migration** - Completed conversion to 4-category system
  - Migrated all sites from legacy (Open, At Risk, Closed) to new system (open_normal, open_restricted, pending, closed)
  - Set decision tracking metadata for all migrated records
  - Result: 202 open_normal, 17 open_restricted sites

### Technical
- Added database indexes for snapshot tables (site_id, snapshot_time)
- Snapshot capture performance: ~2-3 seconds for all 219 sites
- All models now use consistent database connection pattern: `const db = getDatabase()`
- Improved error logging and troubleshooting capabilities

### Performance
- Minimal database impact from snapshots (optimized indexes)
- No performance degradation during ingestion
- Automatic cleanup prevents table bloat

### Documentation
- Added `HISTORICAL-SNAPSHOTS-DEPLOYMENT.md` with complete deployment details
- Documented troubleshooting steps for module caching issues
- Added verification queries and rollback procedures

## [1.3.2] - 2026-02-13

### Added
- **NOAA External Links** - Direct links to official NWS resources on site-detail.html
  - "NWS Forecast" button links to forecast.weather.gov with site's exact lat/lon coordinates
    - Shows local forecast with any active alerts/warnings for that location
  - "Radar Map" button links to radar.weather.gov national radar
  - Links appear on highest severity alert and all advisory cards
  - Opens in new tab with proper security attributes

## [1.3.1] - 2026-02-13

### Fixed
- **Card Behavior Consistency** - All cards across the site now behave predictably
  - Operational Status cards (index.html) are now static with no hover effects
  - Site cards on advisories.html and sites.html are fully clickable (entire card, not just title)
  - Impact Summary cards on site-detail.html are now static with no hover effects
  - Map summary stat cards now toggle severity filters when clicked
- **Weather Impact Count Fix** - GREEN count now correctly shows only sites with Minor advisories
  - Previously counted sites with no advisories as GREEN incorrectly

## [1.3.0] - 2026-02-13

### Added
- **Dashboard UX Overhaul** - Reorganized index.html following action-first dashboard pattern
  - Sites Requiring Attention moved to top (most actionable content first)
  - Sticky update banner with timestamps and site counts (visible while scrolling)
  - Quick action buttons: "View All Sites" and "Map View" for faster navigation
  - "All Clear" success message when no sites need attention
  - Enhanced footer with links to About/Sources and Filter Settings
- **Clickable Dashboard Cards** - All cards now link to filtered views
  - Site attention cards link to site detail page (entire card clickable)
  - Weather Impact cards (RED/ORANGE/YELLOW/GREEN) link to filtered sites list
  - New `weather_impact` URL parameter on sites.html for drill-down filtering
  - Filter banner shows active weather impact filter with clear button
- **5 New MODERATE Alerts Enabled by Default** - Site Default preset now shows 18/68 alert types
  - Winter Storm Watch
  - Winter Weather Advisory
  - Lake Effect Snow Warning
  - Tropical Storm Watch
  - High Surf Warning

### Changed
- **Page Layout Order** - Follows industry best practices for operational dashboards
  1. Sites Requiring Attention (action items)
  2. Weather Impact Assessment (situational awareness)
  3. Operational Status (secondary metrics)
  4. Detailed Statistics (collapsed for power users)
- **Removed "About Storm Scout" section** from dashboard body (moved to footer link)
- **Improved Mobile Responsiveness** - Weather/Status cards now use 2-column grid on mobile
- **Streamlined Status Cards** - Reduced padding for more compact display

### Fixed
- **Navigation Consistency** - All 8 HTML pages now have identical 7-item navigation
  - Removed duplicate "Sources" link from index.html
  - Added missing "Map View" link to notices.html, filters.html, sources.html

## [1.2.2] - 2026-02-13

### Fixed
- **Map View Filter Integration** - Map now respects user filter preferences from Filter Settings
  - Added `alert-filters.js` to map.html
  - Map markers now only display for sites with advisories matching active filters
  - Consistent filtering behavior across all pages (Overview, Advisories, Sites, Map)

## [1.2.1] - 2026-02-13

### Fixed
- **Alert Expiration Bug** - Alerts now properly marked as `expired` when `end_time` passes
  - Added `markExpiredByEndTime()` function to cleanup module
  - Ingestion now marks alerts as expired during each run if `end_time < NOW()`
  - Cleanup module calls `markExpiredByEndTime()` before removing old records
  - Fixes issue where 84+ alerts remained `active` despite expired `end_time`

## [1.2.0] - 2026-02-13

### Added
- **Alerting Module** (`alerting.js`) - Webhook notifications for ingestion/cleanup failures
  - Slack-formatted alerts with severity levels
  - Alert throttling to prevent spam (5 min minimum)
  - Support for ingestion failures, cleanup failures, and anomaly detection
- **Hierarchical Geo-Matching** - Improved site-to-alert matching precision
  - UGC code matching (most precise)
  - County-level matching (fallback)
  - State-level matching (least precise fallback)
- **Database Retry Logic** - Automatic retries for transient connection failures
- **API Rate Limiting** - 500ms minimum between NOAA API requests
- **API Retry with Backoff** - Exponential backoff for 429/5xx responses
- Advisory history table for trend analysis (`advisory_history`)
- New site fields: `county`, `ugc_codes` for precise geo-matching
- Scheduler status endpoint via `getSchedulerStatus()`

### Changed
- **Database Pool Configuration**
  - Increased connection limit to 20
  - Added queue limit (50) to prevent runaway connections
  - Added acquire/connect timeouts (10s each)
  - Keepalive delay increased to 30s
- **Ingestion Process**
  - Advisory creation and status updates now wrapped in transactions
  - Anomaly detection with automatic alerting for sites with >15 advisories
  - Improved logging and error handling
- **Unified Cleanup Module** - Consolidated 4 cleanup scripts into 1
  - Multiple modes: `full`, `vtec`, `event_id`, `expired`, `duplicates`
  - Batched deletes in chunks of 1000
  - Race condition handling with `SELECT ... FOR UPDATE`
  - Automatic alerting on cleanup failures
- **Schema Updated** - `schema.sql` now includes all production columns
  - VTEC fields: `vtec_code`, `vtec_event_id`, `vtec_action`, `vtec_event_unique_key`
  - Site status fields: `weather_impact_level`, `decision_by`, `decision_at`, `decision_reason`
  - New indexes for common query patterns

### Deprecated
- `cleanup-duplicates.js` - Now wraps unified cleanup module
- `cleanup-event-id-duplicates.js` - Now wraps unified cleanup module

### Fixed
- Default User-Agent no longer contains example email (now requires configuration)
- Race conditions in external_id population during cleanup
- Potential memory issues from unbounded connection queues

### Technical
- Added `withRetry()` utility function in database module
- Added `requestWithRetry()` in API client
- Added `enforceRateLimit()` for NOAA API calls
- Added `extractGeoFromAlert()` for hierarchical geo-matching
- Improved transaction handling in `noaa-ingestor.js`
- Scheduler now tracks consecutive failures and alerts appropriately

## [1.1.0] - 2026-02-13

### Added
- Update banner component showing last updated time and countdown to next update
- Update banner deployed to all pages (index, advisories, sites, notices, filters, sources)
- Comprehensive documentation in `docs/` directory
  - `docs/deployment.md` - Production deployment procedures with SSH best practices
  - `docs/api.md` - Complete API documentation emphasizing API layer usage
  - `docs/vtec-implementation.md` - VTEC deduplication system documentation
- ROADMAP.md outlining future improvements and priorities
- CHANGELOG.md for tracking project history
- GitHub issue templates for bug reports, feature requests, and technical debt

### Changed
- Standardized deployment documentation with current production setup
- Documented rationale for SSH over FTP deployment approach
- Emphasized best practice of using API endpoints instead of direct database queries

### Documentation
- Added deployment checklists and verification procedures
- Documented database migration workflows
- Added troubleshooting guides for common issues
- Documented security and backup best practices
- Added VTEC system implementation details and benefits

## [1.0.0] - 2026-02-12

### Added
- VTEC (Valid Time Event Code) event ID deduplication system
- `vtec_event_id` column to advisories table for persistent event tracking
- `vtec_action` column to capture alert lifecycle status (NEW, CON, EXT, etc.)
- Generated column `vtec_event_unique_key` for database-level deduplication
- VTEC action badge display on advisories page with color coding
- Action code tooltips showing status meanings
- Migration scripts for backfilling VTEC data
- Cleanup scripts for removing duplicate events

### Changed
- Advisory deduplication now based on VTEC event ID instead of full VTEC string
- Status column on advisories page renamed to "Action" column
- Database unique constraint updated to use event ID

### Fixed
- Eliminated ~40 duplicate weather alerts across system
- Site 219 (Anchorage) reduced from ~30 to 25 unique alerts
- All VTEC events now properly deduplicated while preserving action history

### Technical
- Added `extractVTECEventID()` function in normalizer.js
- Added `extractVTECAction()` function in normalizer.js
- Updated Advisory model with `findByVTECEventID()` method
- Updated `createOrUpdate()` logic to use event ID for UPSERT operations
- Added indexes for performance: `idx_vtec_event_id`, `idx_vtec_action`

## [0.9.0] - 2026-02-11

### Added
- Alert filtering system with 68 NOAA alert types categorized by impact level
- 5 impact levels: CRITICAL, HIGH, MODERATE, LOW, INFO
- Custom filter configuration UI at `/filters.html`
- 5 filter presets: Site Default, Operations View, Executive Summary, Safety Focus, Full View
- Persistent filter preferences using localStorage
- Real-time advisory count recalculation based on active filters
- Filter-aware display across all dashboard pages

### Changed
- Overview counts now respect user filter preferences (client-side calculation)
- Sites impacted page filters advisories based on user preferences
- Improved filter UI with visual feedback (green borders for enabled, gray for disabled)

### Technical
- Created `alert-filters.js` shared module for filter logic
- Added `/api/filters` endpoint for filter presets
- Added `/api/filters/types/all` endpoint for alert type taxonomy
- Implemented `AlertFilters` JavaScript object for frontend filter management

## [0.8.0] - 2026-02-10

### Added
- 219 US testing center locations across all 50 states and territories
- Real-time NOAA weather data ingestion every 15 minutes
- Automated advisory cleanup removing expired alerts
- Operational status calculation (Open/Closed/At Risk) based on severity
- Sites impacted page showing facilities affected by weather
- Government/local notices page (placeholder for future state/local data)

### Changed
- Improved site matching algorithm for weather alerts
- Enhanced severity-based status determination

## [0.7.0] - 2026-02-09

### Added
- Bootstrap 5.3 responsive dashboard UI
- Six dashboard pages: Overview, Active Advisories, Sites Impacted, Notices, Filters, Sources
- Navigation bar with active page highlighting
- Consistent page layout and styling
- Loading indicators for async data fetching

### Technical
- Created `api.js` frontend module for API client
- Created `utils.js` for shared utility functions
- Implemented responsive design with Bootstrap grid system

## [0.6.0] - 2026-02-08

### Added
- REST API with Express.js
- `/api/status/overview` endpoint for dashboard statistics
- `/api/advisories/active` endpoint for current advisories
- `/api/sites` endpoint for testing center locations
- `/api/status/sites-impacted` endpoint for affected facilities
- `/api/notices/active` endpoint for government notices
- CORS configuration for cross-origin requests

### Technical
- Express routing structure
- MySQL/MariaDB database models
- Database connection pooling with mysql2

## [0.5.0] - 2026-02-07

### Added
- MySQL/MariaDB database schema
- Three main tables: sites, advisories, notices
- Database initialization scripts
- Seed data for 219 US testing centers
- Unique indexes on external IDs to prevent duplicates

### Technical
- Database migrations via SQL scripts
- UPSERT operations for advisory ingestion
- Foreign key relationships between sites and advisories

## [0.4.0] - 2026-02-06

### Added
- NOAA Weather API integration
- Alert fetching by state
- VTEC code extraction from CAP alerts
- Alert normalization and standardization
- Duplicate detection using external IDs

### Technical
- axios for HTTP requests
- node-cron for scheduled ingestion
- Custom NOAA API client with proper User-Agent

## [0.3.0] - 2026-02-05

### Added
- Backend project structure with src/ organization
- Configuration management with dotenv
- Ingestion scheduling with node-cron
- Basic logging infrastructure

## [0.2.0] - 2026-02-04

### Added
- Frontend project structure
- Static HTML pages for all views
- CSS styling with Bootstrap
- JavaScript modules for API interaction

## [0.1.0] - 2026-02-03

### Added
- Initial project setup
- README.md with project description
- Package.json for backend dependencies
- Git repository initialization
- MIT License

---

## Version Numbering

- **Major version (X.0.0)**: Breaking changes or major new features
- **Minor version (0.X.0)**: New features, backward compatible
- **Patch version (0.0.X)**: Bug fixes and small improvements

## Types of Changes

- **Added**: New features
- **Changed**: Changes to existing functionality
- **Deprecated**: Features that will be removed in future versions
- **Removed**: Features removed in this version
- **Fixed**: Bug fixes
- **Security**: Security vulnerability fixes
- **Technical**: Internal/technical changes not visible to users
- **Documentation**: Documentation-only changes

## Links

- [Production Site](https://your-domain.example.com)
- [GitHub Repository](https://github.com/404-nullsignal/storm-scout)
- [Issue Tracker](https://github.com/404-nullsignal/storm-scout/issues)
- [Roadmap](./ROADMAP.md)
