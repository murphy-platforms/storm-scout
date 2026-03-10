# Storm Scout

**An office-focused weather advisory dashboard for USPS Operations teams**

Storm Scout consolidates active weather advisories and operational signals by location to help quickly identify which USPS offices may be impacted and support go/no-go decisions during severe weather events.

## ✨ Features

### Core Functionality
- **300 USPS Locations** - Monitors offices across all 50 states and US territories, identified by 5-digit zip codes
- **Real-Time NOAA Weather Data** - Automatic ingestion of weather alerts every 15 minutes
- **Automated Advisory Cleanup** - Removes duplicate and expired advisories after each ingestion
- **Automatic Alert Expiration** - Alerts marked expired when their `end_time` passes
- **Office Operational Status** - Automatically calculated (Open/Closed/At Risk) based on advisory severity
- **Live Update Tracking** - Dashboard displays last update timestamp and countdown to next refresh
- **Weather Observations** - Current conditions from nearest NWS observation station updated every 15 minutes

### Alert Filtering System
- **94 NOAA Alert Types** - Comprehensive taxonomy covering all official NOAA weather alert types
- **5 Impact Levels** - Alerts categorized as CRITICAL, HIGH, MODERATE, LOW, or INFO
- **Customizable Filters** - Users can enable/disable individual alert types via interactive UI
- **Quick Presets** - Office Default, Operations View, Executive Summary, Safety Focus, All Alerts
- **Persistent Preferences** - Filter settings saved to localStorage and applied across all pages
- **Real-Time Recalculation** - Counts and impacted offices update based on active filter preferences

### User Interface
- **Clean, Responsive UI** - Bootstrap 5.3 dashboard optimized for desktop and tablet
- **6 Dashboard Pages** - Overview, Active Advisories, Offices Impacted, Notices, Filter Settings, Sources
- **Filter-Aware Display** - All pages respect user's filter preferences for consistent data views
- **Alert Detail Modal** - View full NOAA narrative descriptions with "View Full Alert" button on office detail pages
- **Enhanced Alert Cards** - Office detail page shows alert headline, *WHAT description, *WHEN timing, issued time, and source extracted from NOAA descriptions
- **Multiple Advisory Sources** - Currently NOAA/NWS, with support for state/local emergency notices
- **Consistent Design System** - CSS variable-driven colors, z-index scale, and transition durations; Bootstrap Icons used throughout (no mixed emoji in UI chrome); unified loading/error/empty states across all pages
- **Map Marker Clustering** - Leaflet MarkerCluster groups map pins with severity-aware cluster icons; dominant severity color reflected on each cluster badge

### Version & Release
- **Version Display** - Footer on all pages shows version number and release date
- **API Endpoint** - `GET /api/version` returns current version from `package.json`
- **GitHub Releases** - Tagged releases with `v` prefix convention (e.g., `v1.7.5`)

### Performance & Reliability
- **In-Memory Caching** - node-cache with targeted invalidation; static keys (sites, states) survive ingestion cycles to avoid thundering herd; dynamic keys (advisories, status) invalidated and pre-warmed after each ingestion
- **Gzip Compression** - `compression` middleware reduces API response payload ~85% (~500 KB → ~80 KB for full advisory list)
- **Client-Side Caching** - `localStorage` TTL cache (5 min) for advisories, overview, and observations reduces redundant full-dataset fetches on page load and tab switch
- **Pagination** - `GET /api/advisories/active?page=N&limit=N`; default (no params) returns full dataset for backward compatibility
- **DB Connection Pool** - Configurable via `DB_POOL_LIMIT` (default 40); pool exhaustion returns HTTP 503 + `Retry-After: 5` instead of generic 500
- **DB Statement Timeout** - `pool.on('acquire')` sets `max_statement_time` per connection; prevents long-running queries from hanging and exhausting the pool; configurable via `DB_STATEMENT_TIMEOUT_SECONDS` (default 30s)
- **NOAA Circuit Breaker** - CLOSED/OPEN/HALF_OPEN state machine; opens after 3 consecutive exhausted-retry failures; 60s recovery window; state visible in `/health`
- **Graceful Shutdown** - SIGTERM/SIGINT handler drains HTTP connections → stops scheduler → waits for active ingestion (up to 60s) → closes DB pool cleanly
- **Ingestion Performance** - Bulk pre-fetch of existing advisories inside transaction eliminates per-row SELECT round-trips; expiration query chunked into 500-ID batches to avoid `max_allowed_packet` limits
- **Search Debounce** - 300ms debounce on all free-text search inputs eliminates per-keystroke re-renders; `debounce()` utility in `utils.js`
- **UpdateBanner Lifecycle** - Countdown and ingestion-polling timers cleared on page unload (`beforeunload`) and tab hide (`visibilitychange`) to prevent resource leaks and unnecessary background API calls
- **Ingestion Recovery Alerting** - Alert sent on first consecutive ingestion failure; all-clear notification sent automatically when ingestion recovers after a failure streak
- **Observability** - `/health` exposes uptime, memory (heap/RSS in MB), circuit breaker state, ingestion status, and data integrity; structured JSON request logging via `LOG_FORMAT=json`; `X-Data-Age` header on all API responses

### Security
- **API Rate Limiting** - 30,000 requests/60 min general (accommodates corporate NAT environments); 20 req/15 min for write operations; configurable via `RATE_LIMIT_API_MAX`
- **Input Validation** - All API endpoints validated and sanitized with express-validator; advisory type query params whitelisted against the full 94-type NOAA enum
- **Security Headers** - helmet.js with CSP, HSTS, X-Frame-Options, X-Content-Type-Options
- **Timing-Safe Auth** - API key comparison uses `crypto.timingSafeEqual()` with length pre-check to prevent side-channel timing attacks
- **XSS Prevention** - Secure `html` tagged template for safe dynamic HTML rendering
- **CDN Integrity** - Subresource Integrity (SRI) hashes on all external resources
- **Cache-Control Headers** - HTML always revalidates (`no-cache`); static assets cached 7 days with versioned URLs
- **Database SSL** - `DB_SSL=true` enables TLS with `rejectUnauthorized: true` for remote DB connections
- **Fail-Fast Startup** - Production startup validates five required env vars and exits immediately with a clear error if any are missing

### Deployment
- **Production Ready** - Running on Node.js 20 with MySQL/MariaDB backend
- **Database Optimization** - UPSERT operations prevent duplicate advisories, unique indexes on external IDs; natural-key fallback dedup guards against malformed payloads with no external_id or VTEC
- **Safe Deploys** - `deploy.sh` calls `POST /api/admin/pause-ingestion` (API key authenticated) before rsync and waits for any active cycle to finish; ERR trap calls resume on deploy failure; ingestion auto-resumes on app restart
- **Admin API** - `POST /api/admin/pause-ingestion`, `POST /api/admin/resume-ingestion`, `GET /api/admin/status` endpoints (all behind API key); used by deploy script and available for manual operational control
- **Pre-Deploy Smoke Test** - 11 automated checks including API validation and XSS audit; aborts deploy on any failure
- **Deterministic Builds** - `npm ci` (not `npm install`) in all deploy paths ensures package-lock.json is honored
- **Automated Migrations** - `npm run migrate` runs idempotent migrations before app restart on every deploy; `APPLY_MIGRATIONS=false` escape hatch available
- **CI Pipeline** - GitHub Actions runs `npm ci`, `npm audit --audit-level=high`, and `npm test` on every push and pull request
- **Liveness vs Readiness** - `/ping` (no I/O, always 200) for supervisor keep-alive; `/health` (may 503) for readiness monitoring
- **Test Suite** - Jest unit and integration tests for advisory model dedup paths, API key middleware, and advisories route; `supertest` for HTTP-level assertions

### Global Architecture (Planned)
- **Multi-Country Design** - Adapter pattern for ECCC (Canada), MeteoAlarm (EU), SMN (Mexico)
- **Expert Reviewed** - 5-expert panel review with 16 findings, all critical items remediated

## Quick Start

> **Terminology:** Throughout this documentation, "USPS locations" and "offices" refer to the same 300 USPS operational facilities. The codebase and API use "office" consistently; "USPS location" appears in user-facing UI copy.

### Prerequisites

- Node.js 20 LTS (recommended) or 18+
- MySQL 8.0+ or MariaDB 10.5+
- npm
- Git

### 1. Database Setup

Start MariaDB via Docker (recommended for dev/QC):

```bash
docker run -d --name storm-scout-db \
  -e MYSQL_DATABASE=storm_scout_dev \
  -e MYSQL_USER=storm_scout \
  -e MYSQL_PASSWORD=localdev \
  -e MYSQL_ROOT_PASSWORD=root \
  -p 3306:3306 \
  --restart unless-stopped \
  mariadb:11
```

Or create a MySQL/MariaDB database manually:

```sql
CREATE DATABASE storm_scout_dev;
CREATE USER 'storm_scout'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON storm_scout_dev.* TO 'storm_scout'@'localhost';
FLUSH PRIVILEGES;
```

### 2. Backend Setup

```bash
cd backend

npm install

# Configure environment
cp .env.example .env
# Edit .env and set:
#   - MySQL connection details (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME)
#   - Your email in NOAA_API_USER_AGENT

# Initialize database with schema
npm run init-db

# Load USPS office data (run import script first, then seed)
node src/scripts/import-usps-offices.js /path/to/usps-locations.csv
npm run seed-db
```

**CSV format requirements:**

| Column | Required | Description |
|--------|----------|-------------|
| `zip` | Yes | 5-digit USPS zip code (becomes `site_code`) |
| `name` | Yes | Office name |
| `city` | Yes | City name |
| `state` | Yes | 2-letter state code |
| `latitude` | Yes | Decimal latitude |
| `longitude` | Yes | Decimal longitude |
| `region` | Optional | USPS region name |
| `county` | Optional | County name (used for UGC matching) |
| `ugc_codes` | Optional | JSON array string, e.g. `["TXZ123","TXC456"]` |
| `cwa` | Optional | NWS County Warning Area code |

Example header: `zip,name,city,state,latitude,longitude,region,county`

The import **overwrites** `backend/src/data/offices.json` on each run. Rows missing required fields are skipped with a warning. Run summary prints total rows processed, rows skipped, and output path.

```bash

# Start the API server
npm start
```

Backend runs at: **http://localhost:3000**

The server will automatically start ingesting NOAA weather data every 15 minutes if `INGESTION_ENABLED=true` in your `.env` file.

### 3. Run as a Persistent Service (Linux)

To keep the server running across reboots:

```bash
# Install user systemd service
cp deployment/storm-scout-dev.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now storm-scout-dev

# Persist across reboots (no login required)
loginctl enable-linger $USER
```

View logs: `journalctl --user -u storm-scout-dev -f`

## Project Structure

```
storm-scout/
├── backend/              # Node.js + Express API
│   ├── src/
│   │   ├── config/      # Database & configuration
│   │   ├── models/      # Data access layer (office, advisory, observation, etc.)
│   │   ├── routes/      # REST API endpoints
│   │   ├── ingestion/   # NOAA alert + observation fetching
│   │   ├── scripts/     # Maintenance scripts (USPS import, station mapping)
│   │   └── data/        # Schema, offices.json (300 USPS locations), migrations/
│   ├── package.json
│   └── README.md
│
├── deployment/
│   └── storm-scout-dev.service  # systemd user service unit
│
└── frontend/            # Bootstrap 5.3 UI
    ├── index.html         # Overview dashboard
    ├── advisories.html    # Active advisories
    ├── offices.html       # Offices impacted
    ├── office-detail.html # Individual office view
    ├── map.html           # Interactive map view
    ├── notices.html       # Government notices
    ├── filters.html       # Filter configuration
    ├── sources.html       # Data sources
    ├── css/style.css
    └── js/
        ├── api.js           # API client
        ├── utils.js         # Helpers
        ├── alert-filters.js # Shared filter logic
        └── aggregation.js   # Office aggregation utilities
```

## 🛠 Tech Stack

**Backend:** Node.js 18+, Express, MariaDB 11 (Docker), mysql2, node-cron, axios
**Middleware:** node-cache (caching), compression (gzip), express-rate-limit, express-validator
**Frontend:** HTML5, Bootstrap 5.3.8, Vanilla JavaScript, localStorage API
**Data:** NOAA Weather API (94 alert types, 223 observation stations), 300 USPS locations
**Deployment:** Ubuntu Linux, systemd user service, Docker (MariaDB)
**Storage:** MySQL async/await models, unique indexes for data integrity

## Development

### Available Scripts

```bash
cd backend

# Run manual NOAA ingestion
npm run ingest

# Clean up duplicate and expired advisories
npm run cleanup

# Reset database (drop and recreate)
npm run init-db
npm run seed-db

# Start development server
npm start
```

### Key API Endpoints

- `GET /ping` - Liveness probe (always 200, no DB I/O)
- `GET /health` - Readiness and operational health check
- `GET /api/status/overview` - Dashboard statistics (with filter-aware frontend calculations)
- `GET /api/advisories/active` - All active advisories. Supports `?page=N&limit=N` pagination; returns full dataset by default for backward compatibility.
- `GET /api/offices` - All 300 USPS offices
- `GET /api/status/offices-impacted` - Offices with Closed or At Risk status
- `GET /api/filters` - Available filter presets
- `GET /api/filters/types/all` - All NOAA alert types by impact level
- `GET /api/observations` - Current weather observations for all offices
- `GET /api/observations/:officeCode` - Weather observation for a specific office
- `GET /api/trends` - Advisory trend data for all offices
- `GET /api/trends/:officeId` - Trend data for a single office
- `POST /api/admin/pause-ingestion` - Pause ingestion before deploy (API key required)
- `POST /api/admin/resume-ingestion` - Resume ingestion after maintenance (API key required)
- `GET /api/admin/status` - Ingestion scheduler state (API key required)

See `docs/api.md` for complete API documentation.

## Filter Configuration

The default filter preset is **"Office Default" (CUSTOM)** with 47 of 94 alert types enabled:

- **CRITICAL**: 13/13 enabled (all — Tornado Warning, Hurricane Warning, Blizzard Warning, etc.)
- **HIGH**: 17/17 enabled (all — Tornado Watch, Flood Warning, High Wind Warning, etc.)
- **MODERATE**: 17/23 enabled (Winter Weather Advisory, Dense Fog Advisory, Flood Watch, etc.)
- **LOW**: 0/23 enabled (all disabled)
- **INFO**: 0/18 enabled (all disabled)

Users can customize their filter preferences at **/filters.html**, and changes are automatically applied across all dashboard pages.

## Deployment

```bash
# Pre-deploy smoke test (11 checks incl. XSS audit)
cd backend && bash scripts/smoke-test.sh

# Deploy via rsync to target server
DEPLOY_HOST=your-server.example.com DEPLOY_USER=youruser ./deploy.sh
```

See `DEPLOY.md` for detailed deployment instructions.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for local development setup, code style guide, commit conventions, and pull request process.

## Security

Storm Scout implements multiple security controls:

| Control | Implementation | Documentation |
|---------|---------------|---------------|
| XSS Prevention | `html` tagged template in `js/utils.js` | `docs/security/SECURE-TEMPLATES.md` |
| Security Headers | helmet.js in `app.js` | CSP, HSTS, X-Frame-Options |
| CDN Integrity | SRI hashes on all CDN resources | `docs/security/SRI.md` |
| Input Validation | express-validator on all endpoints | `backend/src/validators/` |
| Rate Limiting | express-rate-limit (30,000 req/60 min; corporate NAT-aware) | `backend/src/middleware/rateLimiter.js` |

**Security Assessments:** Point-in-time security audits are stored in `docs/security/assessments/`.

**Reporting vulnerabilities:** See `.github/SECURITY.md` for our security policy.

**Security documentation:** See `docs/security/` for detailed guides, vulnerability tracking, dependency override rationale, and secret rotation policy.

**Architecture & scale:** See `docs/ARCHITECTURE.md` for system overview, scale ceilings, and pre-500-location upgrade requirements.

**Database schema reference:** See [`docs/DATA-DICTIONARY.md`](docs/DATA-DICTIONARY.md) for complete column definitions, enumerations, and table relationships.

**Frontend development:** See [`docs/FRONTEND-GUIDE.md`](docs/FRONTEND-GUIDE.md) for page structure, state management, XSS safety requirements, and the guide to adding new pages.

**Quick reference:** See [`docs/QUICK-REFERENCE.md`](docs/QUICK-REFERENCE.md) for a developer cheat sheet of CLI commands, environment variables, and curl examples.

## License

MIT
