# Changelog

All notable changes to Storm Scout will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Redis caching for API responses
- API rate limiting with express-rate-limit
- Unit tests with Jest
- Input validation with joi
- Database backup automation

## [1.3.2] - 2026-02-13

### Added
- **NOAA External Links** - Direct links to official NOAA resources on site-detail.html
  - "Official NOAA Alert" button links directly to the NWS alert page
  - "View on Map" button links to the state's weather.gov page
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

- [Production Site](https://teammurphy.rocks)
- [GitHub Repository](https://github.com/404-nullsignal/storm-scout)
- [Issue Tracker](https://github.com/404-nullsignal/storm-scout/issues)
- [Roadmap](./ROADMAP.md)
