# AGENTS.md - Storm Scout Project Context

**Project**: Storm Scout  
**Purpose**: Office-focused weather advisory dashboard for USPS Operations teams  
**Production URL**: https://your-usps-domain.example.com  (update when USPS server is configured)
**Status**: Active — USPS deployment (300 locations, zip-code based)
**Last Updated**: 2026-03-10

---

## Project Overview

Storm Scout is a weather advisory monitoring system that consolidates active NOAA weather alerts and operational signals by location to help USPS Operations teams quickly identify which of the 300 USPS locations may be impacted during severe weather events.

### Key Capabilities
- **Real-time NOAA Data**: Automatic ingestion every 15 minutes from NOAA Weather API
- **300 USPS Locations**: Monitoring offices across all 50 US states and territories
- **Smart Filtering**: 94 NOAA alert types with 4 severity levels (Extreme, Severe, Moderate, Minor)
- **Operational Status**: Automatically calculated (Open/Closed/At Risk) based on advisory severity
- **Duplicate Prevention**: Multi-level deduplication using external_id, VTEC event IDs, and VTEC codes; natural-key fallback `(office_id, advisory_type, source, start_time)` guards against malformed payloads where both fields are absent
- **Filter Presets**: Site Default, Operations View, Executive Summary, Safety Focus, Full View
- **Data Integrity**: Database CHECK constraint enforces valid severity values
- **In-Memory Caching**: node-cache with targeted invalidation (static keys preserved across ingestion) and post-ingestion pre-warm to eliminate thundering herd
- **Gzip Compression**: `compression` middleware for ~85% API response size reduction
- **Client-Side Caching**: `localStorage` TTL cache (5 min) in `api.js` for advisories, overview, and observations
- **NOAA Circuit Breaker**: CLOSED/OPEN/HALF_OPEN state machine in `api-client.js`; opens after 3 failures, recovers after 60s; state in `/health`
- **Graceful Shutdown**: SIGTERM/SIGINT drains HTTP → stops scheduler → waits for ingestion idle → closes DB pool
- **Ingestion Performance**: Bulk pre-fetch eliminates per-row SELECT round-trips; NOT IN expiration chunked into 500-ID batches
- **Pagination**: `GET /api/advisories/active?page=N&limit=N` — backward compatible (default returns full dataset)
- **Observability**: `/health` includes uptime, memory (heap/RSS in MB), circuit breaker state; JSON logging via `LOG_FORMAT=json`; `/ping` liveness endpoint (no I/O, always 200) for supervisor keep-alive checks
- **API Rate Limiting**: 30,000 req/60 min general (corporate NAT-aware, configurable via `RATE_LIMIT_API_MAX`), 20 req/15 min for writes (express-rate-limit)
- **Input Validation**: All API endpoints validated with express-validator; advisory type params whitelisted against 94-type NOAA enum Set
- **Timing-Safe Auth**: API key comparison uses `crypto.timingSafeEqual()` with mandatory length pre-check (prevents timing side-channel); in `middleware/apiKey.js`
- **Database SSL**: `DB_SSL=true` env var wires `{ rejectUnauthorized: true }` into mysql2 pool for encrypted remote DB connections
- **Fail-Fast Startup**: `config.js` validates 5 required env vars on startup (`NODE_ENV=production` only); exits immediately with `[FATAL]` stderr block if missing
- **Ingestion Alert Deduplication**: Alerts on first failure only; `alertIngestionRecovery()` sends all-clear when ingestion recovers after a failure streak
- **N+1 Elimination**: `getAllTrends()` uses single SQL query + O(n) JS grouping (replaced 300-query `Promise.all` fan-out)
- **Query Optimization**: `getImpacted()` uses derived-table `LEFT JOIN` instead of correlated subquery for advisory count aggregation
- **Map Marker Clustering**: `leaflet.markercluster` groups overlapping markers; cluster icons colored by highest child severity
- **CI Pipeline**: `.github/workflows/ci.yml` runs `npm ci`, `npm audit --audit-level=high`, `npm test` on push/PR
- **Alert Detail Modal**: View full NOAA narrative descriptions on office-detail page
- **UGC Code Matching**: Precise zone/county-level alert geo-targeting for all 300 USPS locations
- **USPS Office Import**: One-time CSV import via `import-usps-offices.js` to load 300 USPS locations from zip-based CSV
- **Weather Observations**: Current conditions (temperature, humidity, wind, pressure, visibility, etc.) from nearest NWS observation station, updated every 15 minutes
- **Global Architecture Planned**: Adapter-based design for ECCC (Canada), MeteoAlarm (EU), SMN (Mexico) — expert-reviewed, ready for implementation
- **Safe Deployment**: `deploy.sh` calls `POST /api/admin/pause-ingestion` (API-key authenticated) before rsync; waits for active cycle to finish; ERR trap resumes on failure; admin endpoints in `routes/admin.js` also available for manual ops control
- **DB Statement Timeout**: `pool.on('acquire')` sets `SET SESSION max_statement_time` per connection (default 30s, configurable via `DB_STATEMENT_TIMEOUT_SECONDS`); prevents pool exhaustion from long-running queries
- **Search Debounce**: `debounce(fn, 300)` applied to all free-text search inputs in `page-offices.js` and `page-advisories.js`; `debounce()` utility in `utils.js`
- **LocalStorage Resilience**: `alert-filters.js` `loadUserPreferences()` catches `SecurityError`/`SyntaxError`; falls back to default preset and surfaces a Bootstrap Toast notification via `showToast()` in `utils.js`
- **UpdateBanner Cleanup**: `destroy()` method clears `countdownInterval` and `pollingInterval`; wired to `beforeunload` and `visibilitychange` to stop background tab polling
- **Empty-State Consistency**: All list pages use shared `renderEmptyHtml()` utility for zero-result states (advisories table, offices page, advisories card view)
- **Jest Test Suite**: `jest.config.js` configured; `supertest` available; unit tests for `apiKey.js` middleware (5 cases) and `advisory.js` model (dedup paths + `findByNaturalKey`); integration tests for advisories route and `/ping`
- **Automated XSS Audit**: Smoke test includes innerHTML safety check across all frontend files
- **Version Display**: Footer on all 8 pages shows version number and release date via `/api/version` endpoint
- **Stale Cache Safeguards**: Self-unregistering SW stub kills orphaned beta-era service worker; versioned asset URLs (`?v=X.Y.Z`) force cache busting on deploy
- **Cache-Control Headers**: HTML served with `no-cache`; static assets cached 7 days with versioned URLs
- **Ingestion Status API**: `/health` exposes real-time `ingestion.active` flag; `X-Data-Age` header on all API responses
- **Smart Update Countdown**: Frontend shows spinner during data refresh and polls `/health` until ingestion completes

---

## Tech Stack

### Backend
- **Runtime**: Node.js 20 LTS (required for production server)
- **Framework**: Express.js 4.18
- **Database**: MySQL 8.0+ / MariaDB 11.4.9 (async/await with mysql2)
- **Scheduling**: node-cron for 15-minute ingestion cycles
- **HTTP Client**: axios with rate limiting (500ms) and retry logic
- **Caching**: node-cache for in-memory API response caching
- **Validation**: express-validator for input sanitization
- **Rate Limiting**: express-rate-limit for API protection
- **Dependencies**: express, compression, cors, mysql2, node-cron, axios, dotenv, node-cache, express-validator, express-rate-limit

### Frontend
- **UI Framework**: Bootstrap 5.3.8, Bootstrap Icons 1.13.1
- **JavaScript**: Vanilla JS (no framework), ES6+ features
- **State Management**: localStorage for filter preferences
- **API Client**: Fetch API with centralized error handling

### Data Sources
- **NOAA Weather API**: Primary source for all weather advisories and current weather observations
- **NWS Observation Stations**: Current conditions from 223 ICAO weather stations mapped by office lat/lon
- **VTEC Codes**: Valid Time Event Code parsing for deduplication
- **UGC Codes**: County/zone codes for precise geo-matching

### Infrastructure
- **Hosting**: Ubuntu Linux, systemd user service, Docker (MariaDB)
- **Server**: ***REDACTED_HOST***
- **Database**: storm_scout (MariaDB 11.4.9)
- **Deployment**: rsync over SSH (port REDACTED_PORT)

---

## Architecture

### Project Structure
```
strom-scout/
├── backend/              # Node.js + Express API
│   ├── src/
│   │   ├── app.js              # Express app configuration
│   │   ├── server.js           # Server entry point
│   │   ├── config/
│   │   │   ├── database.js     # MySQL connection pool with retry
│   │   │   ├── noaa-alert-types.js  # Alert taxonomy & filter presets
│   │   │   ├── init-database.js
│   │   │   └── seed-database.js
│   │   ├── models/              # Data access layer (async/await)
│   │   │   ├── office.js
│   │   │   ├── advisory.js
│   │   │   ├── advisoryHistory.js
│   │   │   ├── observation.js        # Current weather observations (upsert/query)
│   │   │   ├── notice.js
│   │   │   └── officeStatus.js
│   │   ├── routes/              # REST API endpoints
│   │   │   ├── offices.js
│   │   │   ├── advisories.js
│   │   │   ├── observations.js       # GET /api/observations, /api/observations/:officeCode
│   │   │   ├── operational-status.js
│   │   │   ├── notices.js
│   │   │   ├── status.js
│   │   │   └── filters.js
│   │   ├── ingestion/           # Weather data ingestion
│   │   │   ├── noaa-ingestor.js      # Main ingestion (alerts + observations)
│   │   │   ├── scheduler.js          # Cron scheduler with alerting
│   │   │   ├── local-ingestor.js     # (Planned: state/local feeds)
│   │   │   └── utils/
│   │   │       ├── api-client.js     # NOAA API with rate limiting/retry (alerts + observations)
│   │   │       └── normalizer.js     # Alert normalization & VTEC parsing
│   │   ├── middleware/              # Express middleware
│   │   │   ├── rateLimiter.js       # API rate limiting (500/15min, 20/15min writes)
│   │   │   └── validate.js          # Input validation error handler
│   │   ├── validators/              # Route validation rules
│   │   │   ├── common.js            # Shared rules (id, state, limit)
│   │   │   ├── advisories.js
│   │   │   ├── offices.js
│   │   │   ├── notices.js
│   │   │   ├── history.js
│   │   │   └── status.js
│   │   ├── utils/
│   │   │   ├── cache.js             # In-memory caching with node-cache
│   │   │   ├── cleanup-advisories.js # Unified cleanup module
│   │   │   └── alerting.js          # Failure notification system
│   │   ├── scripts/                  # Maintenance scripts
│   │   │   ├── scheduled-cleanup.js
│   │   │   ├── cleanup-duplicates.js
│   │   │   ├── backfill-vtec-event-id.js
│   │   │   ├── fetch-ugc-codes.js        # Fetch UGC codes from NOAA for all offices
│   │   │   ├── update-ugc-codes.js       # Update database with fetched UGC codes
│   │   │   ├── generate-ugc-sql.js       # Generate SQL for UGC updates
│   │   │   ├── import-usps-offices.js      # Convert USPS CSV to offices.json (run once before init-db)
│   │   │   ├── fetch-observation-stations.js  # Map offices to nearest NWS observation stations
│   │   │   └── smoke-test.sh             # Pre-deploy validation (11 checks incl. XSS audit)
│   │   ├── tests/
│   │   │   └── fixtures/
│   │   │       └── noaa-alerts-snapshot.json  # 540-alert NOAA fixture for regression testing
│   │   └── data/
│   │       ├── schema.sql            # MySQL schema
│   │       ├── offices.json            # 300 USPS locations
│   │       └── migrations/
│   │           └── rollback-global-alert-sources.sql  # MariaDB-compatible rollback for global tables
│   └── package.json
│
└── frontend/            # Bootstrap 5.3 UI
    ├── index.html       # Overview dashboard (Classic)
    ├── advisories.html  # Active advisories list
    ├── offices.html       # Offices impacted
    ├── office-detail.html # Individual office view (with alert detail modal)
    ├── map.html         # Interactive map (future)
    ├── notices.html     # Government notices
    ├── filters.html     # Filter configuration
    ├── sources.html     # Data sources
    ├── archive/         # Archived features
    │   └── beta-2026-02-15/  # Beta UI (removed from production)
    ├── css/style.css
    └── js/
        ├── api.js           # API client (shared by Classic & Beta)
        ├── version.js       # Footer version display (fetches /api/version)
        ├── utils.js         # Helper functions
        ├── alert-filters.js # Shared filter logic
        └── aggregation.js   # Office aggregation utilities
```

### Database Schema

**6 Main Tables**:
1. **offices** - 300 USPS locations (office_code = 5-digit zip, includes observation_station ICAO code)
2. **advisories** - Weather alerts mapped to offices (dynamic, updated every 15 min)
3. **office_observations** - Current weather conditions per office (replaced each ingestion cycle, no history)
4. **office_status** - Operational status tracking (manual overrides + auto-calculation)
5. **notices** - Government/emergency notices (future feature)
6. **advisory_history** - Snapshots for trend analysis (future feature)

**Key Fields**:
- `external_id` (advisories) - NOAA alert ID, UNIQUE constraint prevents duplicates
- `vtec_event_id` (advisories) - Persistent event ID (e.g., "PAFG.BZ.W.0004")
- `vtec_code` (advisories) - Full VTEC string for deduplication
- `vtec_action` (advisories) - Action code (NEW, CON, EXT, EXP, CAN, UPG)
- `ugc_codes` (offices) - JSON array of UGC codes for precise matching
- `cwa` (offices) - NWS County Warning Area office code (e.g., "IND", "GYX")
- `observation_station` (offices) - Nearest NWS observation station ICAO code (e.g., "KORD", "KJFK")
- `office_id` (office_observations) - UNIQUE FK; one observation row per office, replaced each cycle

---

## Development Conventions

### Code Style
- **Async/Await**: All database operations use async/await (no callbacks)
- **Error Handling**: Try/catch blocks with meaningful error messages
- **Logging**: console.log for info, console.error for errors (structured logging planned)
- **Naming**: camelCase for functions/variables, UPPER_CASE for constants
- **Comments**: JSDoc-style comments for public functions (in progress)

### Database Patterns
- **Connection Pool**: Single pool exported from `config/database.js`
- **Transactions**: Use for multi-step operations (especially ingestion)
- **UPSERT**: Use `ON DUPLICATE KEY UPDATE` with `VALUES()` (deprecated in MariaDB 10.3.3+ but still functional; MariaDB 11.4 does NOT support MySQL's `AS alias` syntax yet)
- **Indexes**: All foreign keys and filter columns have indexes

### API Conventions
- **RESTful Routes**: `/api/{resource}` or `/api/{resource}/{id}`
- **Query Params**: Use for filtering (e.g., `?state=CA&status=active`)
- **Error Responses**: JSON with `{ error: "message" }` format
- **CORS**: Enabled for all origins (tighten in production if needed)

### Frontend Patterns
- **No Build Step**: Plain HTML/CSS/JS, no bundler
- **Bootstrap Components**: Use Bootstrap 5.3 classes consistently
- **localStorage**: Persist filter preferences as `selectedFilterPreset` and `customFilters`
- **API Calls**: Centralized in `js/api.js`, auto-detects local vs production API URL

---

## Important Context

### VTEC (Valid Time Event Code)
NOAA uses VTEC codes to uniquely identify weather events. Example:
```
/O.NEW.PAFG.BZ.W.0004.260212T1800Z-260213T0600Z/
```

**Format**: `/O.{ACTION}.{OFFICE}.{PHENOM}.{SIG}.{EVENT}.{START}-{END}/`
- **ACTION**: NEW, CON (continue), EXT (extend), EXP (expire), CAN (cancel), UPG (upgrade)
- **OFFICE**: NWS office code (e.g., PAFG = Fairbanks)
- **PHENOM**: Phenomenon code (e.g., BZ = Blizzard)
- **SIG**: Significance (W = Warning, A = Watch, Y = Advisory)
- **EVENT**: Event number (e.g., 0004 = 4th event of this type this year)

**Deduplication Strategy**:
1. **Primary**: Use `external_id` (NOAA alert ID) - most reliable
2. **Fallback**: Use `vtec_event_id` (persistent across updates)
3. **Last Resort**: Use full `vtec_code` for older alerts

### UGC (Universal Geographic Code)
NOAA uses UGC codes to identify geographic areas in weather alerts.

**Format**: `SSXNNN`
- **SS**: 2-letter state code (e.g., MN, SD)
- **X**: Type indicator - `Z` for public forecast zone, `C` for county
- **NNN**: 3-digit zone/county number

**Examples**:
- `MNZ060` = Twin Cities Metro zone (Minneapolis area)
- `MNC053` = Hennepin County, MN
- `SDZ062` = Sioux Falls zone

**Why both zone AND county?** Different alert types use different codes:
- Winter Storm Warnings → Zone-based (`MNZ060`)
- Tornado Warnings → County-based (`MNC053`)

**Matching Logic** (in `noaa-ingestor.js`):
1. **Level 1**: Match by UGC codes (most precise) - alerts only match offices whose zone/county is explicitly listed
2. **Level 2**: Match by county name (if no UGC match)
3. **Level 3**: State fallback (only for offices WITHOUT UGC codes defined)

**To fetch UGC codes for an office's coordinates**:
```bash
curl -s "https://api.weather.gov/points/{lat},{lon}" | jq '.properties | {forecastZone, county, cwa}'
```

### CWA (County Warning Area)
CWA is the 3-letter NWS office code responsible for a geographic area. Used for direct links to regional NWS office homepages.

**Format**: 3-letter code (e.g., IND, GYX, MFL)

**URL Pattern**: `https://www.weather.gov/{cwa}` (lowercase)
- Example: `https://www.weather.gov/ind` for Indianapolis NWS office

**Usage**: Office detail page "NWS Forecast" button links to the regional office homepage.

### NWS Observation Stations
Each office is mapped to its nearest NWS observation station via `/points/{lat},{lon}` → `observationStations` URL. The mapping stores an ICAO code (e.g., KORD, KJFK) in `offices.observation_station`.

**Key facts**:
- 300 USPS offices map to 223 unique stations (some stations serve multiple nearby offices, e.g., KNYC→3 NYC offices)
- Some stations are non-ICAO mesonet/cooperative stations (e.g., E3225, WTHC1) — these report fewer fields (often missing wind, text_description)
- NWS does NOT include `precipitationLast6Hours` in latest observation responses — this field was removed from the schema
- Staleness detection logs a warning when `observed_at` > 2 hours old (some stations report infrequently)
- If a station returns 404, remap to the next-nearest station via `fetch-observation-stations.js --force` or manual DB update
- Station remapping history: KSVR→KSLC (Salt Lake City), KDKB→KARR (Naperville IL) — originals decommissioned

### Multi-Zone Alert Coverage
Offices near forecast zone boundaries (e.g., Anchorage) may receive multiple alerts of the same type from different NWS offices. **This is working as designed** - each alert has a unique `external_id` and represents different geographic coverage. Phase 2 (zone filtering) could optionally reduce these to preferred offices.

### Filter System
- **Site Default (CUSTOM)**: 47 of 94 alert types enabled (all CRITICAL + all HIGH + key MODERATE for land ops)
- **Operations View**: All CRITICAL, HIGH, MODERATE (excluding marine/special weather statements)
- **Executive Summary**: CRITICAL only
- **Safety Focus**: CRITICAL through LOW (excluding marine/test)
- **Full View**: All 94 alert types (excluding Test/Admin)

Filters are applied **client-side** in the frontend. The API returns all data; frontend filters based on localStorage preferences.

### Storm Scout Severity Alignment
Severity is determined by internal alert type categories, NOT NOAA's raw severity field:
- **CRITICAL** category → Extreme (🔴 RED) - Tornado Warning, Blizzard Warning, etc.
- **HIGH** category → Severe (🟠 ORANGE) - Winter Storm Warning, Flood Warning, etc.
- **MODERATE** category → Moderate (🟡 YELLOW) - Winter Storm Watch, Wind Advisory, etc.
- **LOW/INFO** category → Minor (🟢 GREEN) - Beach Hazards, Rip Current, etc.

This aligns with USPS operational practices. Example: NOAA classifies Winter Storm Watch as "Severe", but Storm Scout displays it as Moderate/Yellow because it's in the MODERATE category.

---

## Key Scripts

### Backend Scripts
```bash
# Development
npm start              # Start server (production mode)
npm run dev            # Start with nodemon (auto-restart)
npm test               # Run unit tests (Jest)
npm run test:watch     # Run tests in watch mode

# Database
npm run init-db        # Initialize schema + load 300 USPS locations
npm run seed-db        # Load seed/sample data

# Data Operations
npm run ingest         # Manual NOAA ingestion
npm run cleanup        # Remove duplicates and expired advisories

# Cleanup Modes
node src/utils/cleanup-advisories.js full       # All cleanup steps
node src/utils/cleanup-advisories.js vtec       # VTEC duplicates only
node src/utils/cleanup-advisories.js event_id   # Event ID duplicates only
node src/utils/cleanup-advisories.js expired    # Remove expired only

# USPS Office Import (one-time, run before init-db)
node src/scripts/import-usps-offices.js /path/to/usps-locations.csv   # Convert CSV to offices.json

# Weather Observation Stations (one-time setup, or re-run with --force)
node src/scripts/fetch-observation-stations.js --dry-run        # Preview station mappings
node src/scripts/fetch-observation-stations.js                  # Apply: maps offices to nearest NWS stations
node src/scripts/fetch-observation-stations.js --force          # Re-map all (overwrite existing)
```

### USPS Office Import Workflow
One-time setup to load USPS locations from CSV:
1. **Import**: `import-usps-offices.js` reads CSV with columns `zip, name, city, state, latitude, longitude` (plus optional `region, county, ugc_codes, cwa`) and writes `src/data/offices.json`.
2. **Init DB**: `npm run init-db` creates schema and loads `offices.json` into the database.
3. To update offices later, re-run `import-usps-offices.js` then `npm run init-db`.

### Pre-Deploy Smoke Test
```bash
# From backend/ directory — starts server, validates all endpoints, shuts down
bash scripts/smoke-test.sh
```

### Deployment
```bash
# One-command deploy (recommended) — pauses ingestion, deploys, resumes
./deploy.sh

# Manual backend deploy
rsync -avz -e "ssh -p 22" --exclude='node_modules' --exclude='.env' backend/ your_user@your-usps-server:~/storm-scout/

# Manual frontend deploy
rsync -avz -e "ssh -p 22" frontend/ your_user@your-usps-server:~/public_html/

# Restart (via cPanel or SSH)
ssh -p 22 your_user@your-usps-server "touch ~/storm-scout/tmp/restart.txt"
```

**Deploy Safety**: `deploy.sh` includes `pause_ingestion()` and `resume_ingestion()` functions that disable the cron scheduler before rsync and re-enable it after restart. This prevents mid-cycle data corruption if an ingestion is running during deployment.

---

## Common Tasks

### Adding a New API Endpoint
1. Create handler in appropriate route file (e.g., `routes/advisories.js`)
2. Add route to `app.js` if it's a new router
3. Test locally with curl or Postman
4. Update `backend/README.md` API documentation
5. Add corresponding frontend call in `js/api.js`

### Modifying Database Schema
1. Update `data/schema.sql` with new columns/tables
2. Create migration SQL in `data/migrations/` (e.g., `20260214-add-column.sql`)
3. **DO NOT** run migrations automatically in production
4. Test locally with `npm run init-db`
5. Apply manually on production via SSH or coordinate with DB admin

### Adding a New Filter Preset
1. Edit `config/noaa-alert-types.js`
2. Add new preset to `FILTER_PRESETS` object
3. Restart server to load new config
4. Frontend automatically picks up new preset from `/api/filters`

### Debugging Duplicate Alerts
1. Check if they have unique `external_id` values:
   ```sql
   SELECT external_id, advisory_type, headline, office_id 
   FROM advisories 
   WHERE office_id = 2703 AND advisory_type = 'Blizzard Warning';
   ```
2. If unique external_ids → legitimate multi-zone coverage
3. If duplicate external_ids → check UPSERT logic in `noaa-ingestor.js`
4. Run cleanup: `npm run cleanup`

---

## Roadmap Context

### Completed (Phase 1)
- ✅ VTEC event ID deduplication
- ✅ External ID unique constraint
- ✅ Automated cleanup system
- ✅ Production deployment
- ✅ 300 USPS locations loaded
- ✅ 15-minute NOAA ingestion working
- ✅ Severity validation (defaults Unknown to Minor)
- ✅ Database CHECK constraint on severity
- ✅ Composite index for status+severity queries
- ✅ In-memory caching with node-cache (status/overview, offices, advisories/active)
- ✅ API rate limiting with express-rate-limit (500 req/15 min, 20 writes/15 min)
- ✅ Input validation with express-validator (all endpoints)
- ✅ Storm Scout Severity Alignment (uses internal categories instead of NOAA raw severity)
- ✅ 4-tier severity grouping (Offices Requiring Attention matches Weather Impact colors)
- ✅ UGC code matching for all 300 USPS locations (precise zone/county geo-targeting)
- ✅ Fixed state-level fallback to only apply to offices without UGC codes
- ✅ USPS office import workflow (import-usps-offices.js converts CSV → offices.json)
- ✅ Dashboard cards show office_code + office_name (index.html, advisories.html, offices.html)
- ✅ Office detail alert cards show headline, *WHAT description, *WHEN timing, issued, source (expires removed)
- ✅ Weather observations from nearest NWS station (temperature, humidity, wind, pressure, visibility, clouds, etc.)
- ✅ Observation station mapping for all 300 USPS locations (223 unique stations)
- ✅ Observation review: data accuracy validated, failed stations remapped, stale detection added
- ✅ Local development environment with MariaDB, Jest, and smoke test script
- ✅ Frontend API client auto-detects local vs production (no hardcoded URL)
- ✅ Global alert source architecture designed (adapter pattern for ECCC, MeteoAlarm, SMN)
- ✅ Expert panel review (5 experts, 16 findings, 11 remediated — GitHub #59-69)
- ✅ Deploy safety: `deploy.sh` pauses/resumes ingestion around rsync
- ✅ Smoke test XSS audit (innerHTML safety check across all frontend files)
- ✅ MariaDB-compatible rollback migration for global alert source tables
- ✅ NOAA alerts snapshot fixture (540 alerts) for future regression testing
- ✅ Stale cache safeguards: self-unregistering SW stub, versioned asset URLs, Cache-Control headers
- ✅ Ingestion status API: `/health` includes `ingestion.active`, `X-Data-Age` header on API responses
- ✅ Smart frontend countdown with ingestion polling
- ✅ Removed orphaned `pwa.js` and `manifest.json` from beta era
- ✅ Bootstrap 5.3.0→5.3.8, Icons 1.11.1→1.13.1 upgrade with updated SRI hashes
- ✅ Consolidated duplicate helper functions into shared `js/utils.js`

### High Priority (Next)
- [ ] Unit tests (Jest) for models and utilities
- [ ] Global alert source implementation (ECCC adapter — Canada, Phase 2)

### Medium Priority
- [ ] Phase 2: Zone filtering (reduce multi-zone alerts to preferred offices) - 10-12 hours
- [ ] MeteoAlarm adapter (EU) and SMN adapter (Mexico)
- [ ] Email notifications for critical events
- [ ] WebSocket support for real-time updates
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Structured logging (Winston or Pino)

### Low Priority
- [ ] Dark mode
- [ ] Data visualization (charts, graphs)
- [ ] Mobile app (React Native)
- [ ] Advanced features (alert correlation, predictive analytics)

See `ROADMAP.md` for full list.

---

## Production Environment

### Server Details
- **Host**: ***REDACTED_HOST***
- **SSH**: `ssh -p 22 your_user@your-usps-server`
- **cPanel**: https://***REDACTED_HOST***:2083
- **Node.js**: Version 20 LTS (via cPanel Node.js app)
- **Process Manager**: Passenger (cPanel)

### Environment Variables (Production)
Set in cPanel → Node.js app interface:
- `NODE_ENV=production`
- `PORT=3000` (managed by Passenger)
- `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` (MySQL connection)
- `NOAA_API_USER_AGENT=StormScout/1.0 (your-email@example.com)` ⚠️ **REQUIRED**
- `INGESTION_ENABLED=true`
- `INGESTION_INTERVAL_MINUTES=15`
- `ALERT_WEBHOOK_URL` (optional, for Slack notifications)

### Monitoring
- **Health Check**: `curl https://your-usps-domain.example.com/health` (enhanced with database + ingestion status)
- **Logs**: cPanel → Node.js → View Logs
- **Database**: phpMyAdmin in cPanel
- **Ingestion Status**: Check `last_updated` in advisories table

### Database Access

**Connection Details**:
- **Host**: localhost (from server) 
- **Port**: 3306
- **Database**: `storm_scout`
- **User**: `storm_scout`
- **Password**: Stored in `~/storm-scout/.env` on production server

**Access Methods**:

1. **Via SSH (Command Line)**:
   ```bash
   # Connect to server
   ssh -p 22 your_user@your-usps-server
   
   # Access MySQL (password from .env file)
   mysql -u storm_scout -p storm_scout
   
   # Or with password inline (get from .env)
   mysql -u storm_scout -p"$(grep DB_PASSWORD ~/storm-scout/.env | cut -d= -f2)" storm_scout
   
   # Run a single query
   mysql -u storm_scout -p"$DB_PASS" storm_scout -e "SELECT COUNT(*) FROM offices;"
   ```

2. **Via phpMyAdmin (GUI)**:
   - Go to https://***REDACTED_HOST***:2083 (cPanel)
   - Click **phpMyAdmin** in the Databases section
   - Select `storm_scout` from the left sidebar
   - Use SQL tab to run queries

3. **Via Local SSH Tunnel** (for GUI tools like TablePlus, DBeaver):
   ```bash
   # Create SSH tunnel (run locally)
   ssh -p 22 -L 3307:localhost:3306 your_user@your-usps-server
   
   # Then connect your GUI tool to:
   # Host: 127.0.0.1
   # Port: 3307
   # User: storm_scout
   # Password: (from .env)
   # Database: storm_scout
   ```

**Common Queries**:
```sql
-- Check active advisory count
SELECT COUNT(*) FROM advisories WHERE status = 'active';

-- Offices with most alerts
SELECT s.office_code, s.name, s.state, COUNT(*) as alert_count
FROM offices s JOIN advisories a ON s.id = a.office_id
WHERE a.status = 'active'
GROUP BY s.id ORDER BY alert_count DESC LIMIT 10;

-- Check UGC codes for an office
SELECT office_code, name, state, ugc_codes, county FROM offices WHERE office_code = '87102';

-- View alerts for a specific office
SELECT advisory_type, severity, headline, start_time, end_time
FROM advisories WHERE office_id = (SELECT id FROM offices WHERE office_code = '87102') AND status = 'active';
```

**⚠️ Security Notes**:
- Never commit database credentials to git
- Password is stored in `.env` file on server (not in version control)
- Use SSH key authentication when possible (key configured at `~/.ssh/id_ed25519`)

### Database Backup & Disaster Recovery

**Critical Data**: The Storm Scout database (`storm_scout`) contains:
- **Static**: 300 USPS locations (offices table) - can be reloaded from `backend/src/data/offices.json`
- **Dynamic**: Active weather advisories (advisories table) - repopulates automatically within 15 minutes
- **Transient**: Weather observations (office_observations table) - repopulates automatically within 15 minutes
- **Historical**: Advisory snapshots (advisory_history table) - **IRREPLACEABLE** if lost
- **Configuration**: Office status overrides (office_status table) - manual USPS Operations decisions, **CRITICAL** to preserve

**Backup Strategy**:

1. **Automated Daily Backups (cPanel)**
   - **Frequency**: Daily at 2:00 AM EST (configured in cPanel)
   - **Retention**: 7 days (shared hosting default)
   - **Location**: cPanel → Backups → Download Full Backup
   - **Access**: Log into https://***REDACTED_HOST***:2083, navigate to Backups
   - **Restore**: cPanel → Backups → Restore → Select backup file

2. **Manual Weekly Backups (Recommended)**
   - **Frequency**: Every Sunday (or after major changes)
   - **Method**: Export via phpMyAdmin or command line
   - **Storage**: Local machine + offsite (Google Drive, Dropbox, etc.)
   
   ```bash
   # Via SSH (requires password)
   ssh -p 22 your_user@your-usps-server
   mysqldump -u storm_scout_user -p storm_scout > stormscout_backup_$(date +%Y%m%d).sql
   
   # Download backup to local machine
   scp -P 22 your_user@your-usps-server:~/stormscout_backup_*.sql ~/backups/
   ```
   
   Via phpMyAdmin:
   - Log into cPanel → phpMyAdmin
   - Select `storm_scout` database
   - Export → Quick → SQL → Go
   - Save `.sql` file locally

3. **Pre-Deployment Backups (Required)**
   - **Always** create a backup before:
     - Database schema changes (migrations)
     - Major version upgrades
     - Bulk data operations
   - Store with deployment notes and git commit hash

**Recovery Procedures**:

1. **Full Database Restore** (Disaster Recovery):
   ```bash
   # Via SSH
   ssh -p 22 your_user@your-usps-server
   mysql -u storm_scout_user -p storm_scout < stormscout_backup_YYYYMMDD.sql
   ```
   
   Via phpMyAdmin:
   - cPanel → phpMyAdmin → Import
   - Choose backup `.sql` file
   - Execute
   
   **Post-Restore Steps**:
   - Verify offices count: `SELECT COUNT(*) FROM offices;` (should be 300)
   - Check for active advisories: `SELECT COUNT(*) FROM advisories WHERE status='active';`
   - Restart ingestion: Backend will auto-populate advisories within 15 minutes
   - Verify health: `curl https://your-usps-domain.example.com/health`

2. **Partial Recovery** (Specific Tables):
   - Export single table from backup:
     ```bash
     # Extract specific table from full backup
     sed -n '/DROP TABLE.*`advisory_history`/,/UNLOCK TABLES/p' backup.sql > advisory_history_only.sql
     mysql -u storm_scout_user -p storm_scout < advisory_history_only.sql
     ```

3. **Data Loss Scenarios**:
   
   | Scenario | Impact | Recovery Time | Steps |
   |----------|--------|---------------|-------|
   | **Offices table lost** | 🔴 Critical - No advisories can be matched | 5 min | Run `npm run seed-db` from backend (300 USPS locations) |
   | **Advisories table lost** | 🟡 Moderate - Data repopulates automatically | 15 min | Next ingestion cycle will rebuild active advisories |
   | **Advisory_history lost** | 🟠 High - Historical trends lost permanently | N/A | Must restore from backup (no auto-recovery) |
   | **Office_status lost** | 🔴 Critical - Manual IMT decisions lost | Varies | Restore from backup; IMT must re-enter manual overrides |
   | **Complete DB loss** | 🔴 Critical - Full outage | 10-15 min | Restore from latest backup, verify, restart |

**Backup Verification**:

Test backups monthly by:
1. Download latest backup
2. Restore to local test database (`storm_scout_test`)
3. Verify table counts and data integrity
4. Document any issues

```bash
# Local restore test
mysql -u root -p storm_scout_test < stormscout_backup_YYYYMMDD.sql
mysql -u root -p storm_scout_test -e "SELECT COUNT(*) FROM offices;"
mysql -u root -p storm_scout_test -e "SELECT COUNT(*) FROM advisories;"
```

**Backup Security**:
- Backups contain **no personally identifiable information (PII)**
- Database passwords should **never** be committed to git or stored in backups
- Store backups encrypted if possible (use GPG or disk encryption)
- Rotate backup files older than 30 days

**Documentation Updates**:
- **Last Backup Verified**: [Add date after testing restore]
- **Backup Location**: [Add your backup storage location]
- **Contact for Restore**: [Add USPS/DevOps contact]

---

## Testing Strategy

### Local Development Environment
A full local environment exists for QC testing changes before deploying to production.

**Prerequisites** (already installed):
- MariaDB (via Homebrew: `brew services start mariadb`)
- Node.js (Homebrew)
- Local database: `storm_scout_dev` with user `storm_scout`

**Local Setup** (one-time, already done):
```bash
# Install MariaDB
brew install mariadb && brew services start mariadb

# Create local database
mariadb -u $(whoami) -e "CREATE DATABASE storm_scout_dev; CREATE USER 'storm_scout'@'localhost' IDENTIFIED BY 'localdev'; GRANT ALL PRIVILEGES ON storm_scout_dev.* TO 'storm_scout'@'localhost';"

# Initialize schema and seed data
cd backend
npm run init-db
npm run seed-db
```

**Local `.env` Configuration** (`backend/.env`):
- `DB_HOST=localhost`, `DB_NAME=storm_scout_dev`, `DB_USER=storm_scout`, `DB_PASSWORD=localdev`
- `STATIC_FILES_PATH=../frontend` — backend serves frontend at http://localhost:3000
- `INGESTION_ENABLED=false` — avoids hitting NOAA API; run `npm run ingest` manually when needed
- `CORS_ORIGIN=*`

**Frontend API URL** (`frontend/js/api.js`):
- Auto-detects environment: uses `localhost:3000/api` locally, `/api` in production
- No manual URL switching needed between environments

**Daily Local Dev Workflow**:
```bash
cd backend
npm run dev                    # Start server + frontend at http://localhost:3000
open http://localhost:3000     # View dashboard in browser
npm test                       # Run unit tests (Jest)
npm run ingest                 # Optional: pull live NOAA data
bash scripts/smoke-test.sh     # Pre-deploy: validates all API endpoints + frontend
```

### Unit Tests
- **Framework**: Jest (configured in `package.json`)
- **Test location**: `backend/tests/unit/`
- **Run**: `npm test` or `npm run test:watch`
- **Existing tests**: VTEC extraction and NOAA alert normalization (9 tests)

### Smoke Test
The smoke test script (`backend/scripts/smoke-test.sh`) automates pre-deploy validation:
1. Starts the server in the background
2. Waits for it to be ready
3. Validates all key API endpoints (health, offices, advisories, status, filters, observations)
4. Verifies 300 USPS locations are loaded
5. Confirms frontend is served correctly
6. **innerHTML XSS safety audit** — scans all frontend `.html` and `.js` files for unsafe `innerHTML` usage without `html` tagged template (reports as warning, does not fail build)
7. Shuts down the server and reports results

**Total checks**: 11 (10 endpoint/content checks + 1 XSS audit)

Run from `backend/`: `bash scripts/smoke-test.sh`

### Pre-Deployment Checklist
- [ ] Code tested locally (`npm run dev` + browser verification)
- [ ] Unit tests pass (`npm test`)
- [ ] Smoke test passes (`bash scripts/smoke-test.sh`)
- [ ] No console errors in browser
- [ ] API endpoints return expected data
- [ ] Database migrations documented (if any)
- [ ] Git commit with clear message
- [ ] `.env` changes documented (don't commit `.env`)

### Post-Deployment Verification
- [ ] Health check passes: `https://your-usps-domain.example.com/health`
- [ ] Frontend loads: `https://your-usps-domain.example.com`
- [ ] API responds: `https://your-usps-domain.example.com/api/offices`
- [ ] Dashboard shows data (offices, advisories, counts)
- [ ] No errors in cPanel logs

---

## Known Issues & Quirks

### 1. Multi-Zone Alert "Duplicates"
**Issue**: Offices near zone boundaries (e.g., Anchorage office code 99501) show multiple alerts of the same type.  
**Root Cause**: Legitimate coverage from multiple NWS offices, each with unique `external_id`.  
**Status**: Working as designed. Phase 2 (zone filtering) would be optional enhancement.

### 2. NOAA API Rate Limiting
**Issue**: NOAA may throttle if too many rapid requests.  
**Mitigation**: Built-in 500ms delay between requests, automatic retry with exponential backoff.  
**User-Agent**: MUST include contact email or NOAA may block requests.

### 3. Expired Advisories
**Issue**: Advisories past their `end_time` may linger briefly.  
**Mitigation**: Cleanup runs after each ingestion cycle, marks as expired and deletes.

### 4. Shared Hosting Limitations
**Issue**: cPanel shared hosting has memory/CPU limits, can't use PM2.  
**Mitigation**: Use Passenger (handles restarts), optimize queries, add Redis caching for high-traffic endpoints.

### 5. Node.js Version Pinning
**Issue**: Production server requires Node.js 20 LTS.  
**Mitigation**: Use `source ~/nodevenv/storm-scout/20/bin/activate` on server, document in deployment scripts.

---

## Troubleshooting Guide

### Backend Won't Start
1. Check MySQL connection: `mysql -u storm_scout_user -p storm_scout`
2. Verify `.env` file exists and has correct values
3. Check Node.js version: `node --version` (should be 20.x)
4. Check for port conflicts: `lsof -i :3000`
5. Review logs: cPanel → Node.js → View Logs

### Ingestion Failing
1. Check User-Agent in `.env`: `NOAA_API_USER_AGENT` must include email
2. Test NOAA API manually: `curl -A "StormScout/1.0 (test@example.com)" https://api.weather.gov/alerts/active`
3. Check database connection (ingestion requires write access)
4. Review logs for specific error messages
5. Run manual ingestion: `npm run ingest`

### Frontend Not Loading Data
1. Check API base URL in `js/api.js` (auto-detects localhost vs production — no hardcoded URL)
2. Test API directly: `curl https://your-usps-domain.example.com/api/offices`
3. Check browser console for CORS errors
4. Verify backend is running: `curl https://your-usps-domain.example.com/health`
5. Clear localStorage and refresh: `localStorage.clear()`

### Duplicate Alerts Appearing
1. Check if they have unique `external_id` values (query database)
2. If unique → legitimate multi-zone coverage (working as designed)
3. If duplicate → run cleanup: `npm run cleanup`
4. Check UPSERT logic in `ingestion/noaa-ingestor.js`
5. Verify unique constraint exists: `SHOW INDEX FROM advisories;`

### Deployment Fails
1. Test SSH connection: `ssh -p 22 your_user@your-usps-server`
2. Check rsync is installed: `which rsync`
3. Verify paths in `.deploy.config.local`
4. Check server disk space: `ssh stormscout "df -h"`
5. Manual deployment as fallback (see `DEPLOY.md`)

---

## Git Workflow

### Branch Strategy
- **main**: Production-ready code, deployed to https://your-usps-domain.example.com
- Feature branches: Create for major features (e.g., `feature/zone-filtering`)
- Hotfix branches: For urgent production fixes (e.g., `hotfix/ingestion-crash`)

### Commit Messages
Use conventional commit format:
```
feat: Add zone filtering to reduce multi-zone alerts
fix: Correct VTEC event ID extraction for Alaska zones
docs: Update AGENTS.md with troubleshooting guide
refactor: Extract VTEC parsing to separate utility
```

### Co-Authorship
When AI assists with commits, include:
```
Co-Authored-By: Warp <agent@warp.dev>
```

### Release Process
When cutting a new release:
1. Update `version` and `releasedDate` in `backend/package.json`
2. Add entry to `CHANGELOG.md`
3. Commit and push to main
4. Create annotated tag: `git tag -a v{X.Y.Z} -m "v{X.Y.Z}: {summary}"`
5. Push tag: `git push origin v{X.Y.Z}`
6. Create GitHub release: `gh release create v{X.Y.Z} --title "v{X.Y.Z} - {title}" --notes "..."` (use CHANGELOG section as body)
7. Version auto-displays in UI footer via `/api/version`

**Tag convention**: Always use `v` prefix (e.g., `v1.7.5`). This is the Node.js ecosystem standard.

**Single source of truth**: `package.json` → `/api/version` endpoint → frontend footer. Only update `package.json`; the rest follows automatically.

---

## Contact & Support

### Key Documentation Files
- `README.md` - Project overview and quick start
- `ROADMAP.md` - Feature priorities and technical debt
- `TODO.md` - Active task list
- `NEXT-STEPS.md` - Phase 1 results and next actions
- `DEPLOY.md` - Deployment instructions
- `backend/README.md` - Backend API documentation
- `CHANGELOG.md` - Version history
- `docs/security/README.md` - Security vulnerability tracking
- `docs/security/SECURE-TEMPLATES.md` - XSS prevention guide
- `docs/security/SRI.md` - CDN integrity hashes
- `docs/security/TRUST-PROXY.md` - Proxy configuration

### Useful Commands
```bash
# Quick status check
git status
npm run ingest  # Test ingestion locally
curl https://your-usps-domain.example.com/health  # Check production

# Database inspection
mysql -u storm_scout_user -p storm_scout
SELECT COUNT(*) FROM advisories WHERE status = 'active';
SELECT office_code, name, COUNT(*) as alert_count 
FROM offices s JOIN advisories a ON s.id = a.office_id 
WHERE a.status = 'active' 
GROUP BY s.id ORDER BY alert_count DESC LIMIT 10;

# Log monitoring
ssh -p 22 your_user@your-usps-server "tail -f ~/logs/storm-scout.log"
```

---

## Security Best Practices

Storm Scout follows these security patterns established during the February 2026 security remediation. **All new code should adhere to these practices.**

### 1. XSS Prevention (Frontend)

**Never use raw `innerHTML` with dynamic data.** Use the secure `html` tagged template function from `js/utils.js`:

```javascript
// ❌ WRONG - XSS vulnerable
container.innerHTML = `<div>${userData}</div>`;

// ✅ CORRECT - Auto-escaped
container.innerHTML = html`<div>${userData}</div>`;

// ✅ For trusted HTML (badges, icons), use raw()
container.innerHTML = html`<div>${raw(getSeverityBadge(severity))}</div>`;
```

**IMPORTANT: This applies to ALL files that generate HTML**, including:
- HTML pages with inline `<script>` tags
- Standalone JS utility files (e.g., `trends.js`, `export.js`)
- Any code that uses `innerHTML`, `insertAdjacentHTML`, or similar

**For standalone JS files** that can't import `utils.js` (e.g., files that generate downloadable reports), add a local `escapeHtml()` function:

```javascript
// Local escapeHtml for standalone files
escapeHtml(unsafe) {
    if (unsafe == null) return '';
    return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
```

**Key files:**
- `frontend/js/utils.js` - Contains `escapeHtml()`, `raw()`, and `html` tagged template
- `frontend/beta/js/utils.js` - Beta UI version of the same utilities
- `docs/security/SECURE-TEMPLATES.md` - Full documentation

### 2. Security Headers (Backend)

**helmet.js is configured in `app.js`** with:
- Content-Security-Policy (CSP) - Restricts script/style sources
- Strict-Transport-Security (HSTS) - Forces HTTPS
- X-Frame-Options - Prevents clickjacking
- X-Content-Type-Options - Prevents MIME sniffing

**CSP Trade-offs:**
The CSP uses `'unsafe-inline'` for scripts/styles because:
- Google Analytics requires inline scripts
- Bootstrap uses inline styles
- Static HTML files can't use server-generated nonces

**Mitigations in place:**
- `script-src-attr 'none'` - **Blocks inline event handlers** (onclick, onerror) - the primary XSS vector
- `object-src 'none'` - Blocks Flash/plugins
- `base-uri 'self'` - Prevents base tag hijacking
- All user-facing HTML uses the `html` tagged template with escaping

**When adding new external resources:**
1. Add the domain to the appropriate CSP directive in `app.js`
2. Test locally before deploying
3. Check browser console for CSP violations

```javascript
// Example: Adding a new CDN to CSP
scriptSrc: [
  "'self'",
  "cdn.jsdelivr.net",
  "new-cdn.example.com"  // Add new sources here
]
```

### 3. Subresource Integrity (Frontend)

**All CDN resources must include SRI hashes.** When updating Bootstrap or other CDN libraries:

```bash
# Generate SRI hash for any URL
curl -s <URL> | openssl dgst -sha384 -binary | openssl base64 -A
```

```html
<!-- Always include integrity and crossorigin attributes -->
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/js/bootstrap.bundle.min.js"
        integrity="sha384-..." 
        crossorigin="anonymous"></script>
```

**Key files:**
- `docs/security/SRI.md` - Current hashes and update procedures

### 4. Trust Proxy Configuration

**Storm Scout runs behind LiteSpeed proxy.** The `trust proxy` setting in `app.js` ensures:
- Rate limiter sees real client IPs (not proxy IP)
- Logging shows actual user IPs
- IP-based security controls work correctly

```javascript
// Already configured - do not remove
app.set('trust proxy', 1);
```

**Key files:**
- `docs/security/TRUST-PROXY.md` - Configuration details

### 5. Input Validation (Backend)

**All API endpoints use express-validator.** When adding new routes:

```javascript
// In routes/example.js
const { param, query } = require('express-validator');
const validate = require('../middleware/validate');

router.get('/:id',
  param('id').isInt({ min: 1 }),
  validate,  // Always include validation middleware
  async (req, res) => { ... }
);
```

**Key files:**
- `backend/src/validators/` - Validation rules by route
- `backend/src/middleware/validate.js` - Error handler

### 6. Rate Limiting

**API endpoints are rate-limited:**
- General: 500 requests / 15 minutes
- Write operations: 20 requests / 15 minutes

Rate limits are enforced in `middleware/rateLimiter.js`. Adjust thresholds there if needed.

### 7. Dependency Security

**Regularly check for vulnerabilities:**

```bash
cd backend && npm audit
```

**When vulnerabilities are found:**
1. Check if it affects Storm Scout's usage
2. Update to patched version if available
3. Document in commit message with CVE reference
4. If a transitive dependency requires pinning via `overrides`, add an entry to both the `overrides` and `overrideReasons` fields in `backend/package.json`, and document the CVE(s) in `docs/security/README.md` § Dependency Overrides

**Checking active dependency overrides:**
```bash
cd backend && npm ls qs  # verify pinned transitive deps are still effective
```

### Security Documentation

All security documentation is in `docs/security/`:
- `README.md` - Vulnerability tracking, dependency override rationale, secret rotation policy
- `SECURE-TEMPLATES.md` - XSS prevention guide
- `SRI.md` - Subresource Integrity hashes
- `TRUST-PROXY.md` - Proxy configuration
- `assessments/` - Point-in-time security assessments

### Architecture & Scale Documentation

`docs/ARCHITECTURE.md` documents:
- System overview and data flow diagram
- Current tested scale thresholds (300 locations, 40-connection pool)
- Scale ceilings per component (UI, backend, database, infrastructure)
- Five triggers for a scale review (500 locations, 2M advisory rows, etc.)
- Minimum required changes before operating at >500 locations
- Planned architectural work
- Key file index

### Security Checklist for New Features

- [ ] Dynamic HTML uses `html` tagged template (not raw `innerHTML`)
- [ ] **Standalone JS files** that generate HTML have `escapeHtml()` protection
- [ ] New API endpoints have input validation
- [ ] External resources include SRI hashes
- [ ] New CDN domains added to CSP in `app.js`
- [ ] No secrets in code (use environment variables)
- [ ] Dependencies checked with `npm audit`

### Periodic Security Audit Checklist

Run quarterly or after major changes:

```bash
# 1. Check dependencies
cd backend && npm audit

# 2. Verify security headers in production
curl -sI https://your-usps-domain.example.com | grep -iE "(strict-transport|x-frame|content-security|x-content-type)"

# 3. Search for unsafe innerHTML patterns
grep -rn "\.innerHTML\s*=" frontend/ --include="*.html" --include="*.js" | grep -v "html\`"

# 4. Verify SRI hashes on CDN resources
curl -s https://your-usps-domain.example.com | grep -E 'integrity="sha'

# 5. Test input validation
curl -s "https://your-usps-domain.example.com/api/advisories?office_id=abc" | jq .error
```

**Document findings** in `docs/security/assessments/` with date-stamped reports.

---

## AI Assistant Guidelines

When working on Storm Scout:

1. **Always check current state first**: Run `git status`, check database schema, review existing code before making changes.

2. **Respect existing patterns**: Follow the async/await style, use the connection pool from `config/database.js`, maintain RESTful API conventions.

3. **Test before deploying**: Run locally, test API endpoints, verify database changes before suggesting deployment.

4. **Document changes**: Update README files, add comments to complex logic, create migration files for schema changes.

5. **Be cautious with production**: Never commit `.env` files, always exclude `node_modules` from rsync, test SSH connection before deployment.

6. **Consider operational impact**: Changes affecting ingestion or cleanup should be thoroughly tested - they run every 15 minutes in production.

7. **Explain trade-offs**: When suggesting features (e.g., Phase 2 zone filtering), outline effort, impact, and potential downsides.

8. **Check dependencies**: Storm Scout uses specific versions (Node 20, Bootstrap 5.3.8, MySQL 8) - ensure compatibility.

9. **Follow the roadmap**: Prioritize high-priority items from `ROADMAP.md` unless user specifies otherwise.

10. **Provide context**: When investigating issues, share relevant code snippets, database queries, and log excerpts to help the user understand.

---

**This file is for AI assistants working on Storm Scout. Keep it updated as the project evolves.**
