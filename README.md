# Storm Scout

**An office-focused weather advisory dashboard for operations teams**

Storm Scout consolidates active weather advisories and operational signals by location to help quickly identify which offices may be impacted during severe weather events.

> **Note:** Storm Scout is an independent open-source project. It is not affiliated with, endorsed by, or connected to any government agency or postal service. See the full [Disclaimer](frontend/disclaimer.html) below.

## Why Storm Scout?

Organizations that manage physical locations — retail chains, logistics networks, field service teams, government offices — face a common problem: there is no simple way to monitor weather threats across all of their sites at once. When severe weather hits, operations teams resort to checking weather.gov manually for each location, one zip code at a time. This leads to delayed decisions, inconsistent response across regions, and hours of effort that could be automated. Storm Scout solves this by consolidating real-time NOAA weather alerts for hundreds of locations into a single dashboard, giving operations leaders the situational awareness they need to act quickly and consistently.

## Screenshots

*Screenshots are being updated. Run the application locally to preview the dashboard UI.*

## How It Works

```
 NOAA Weather API          NWS Observation API
       │                          │
       ▼                          ▼
┌──────────────────────────────────────────┐
│         Node.js / Express Backend        │
│                                          │
│  noaa-ingestor.js    observation-        │
│  (15-min cron,       ingestor.js         │
│   UGC matching,      (station data)      │
│   VTEC dedup)                            │
│                                          │
│  REST API (cached, rate-limited, gzip)   │
└──────────────┬───────────────────────────┘
               │
               ▼
        ┌─────────────┐
        │  MariaDB /   │
        │  MySQL       │
        └─────────────┘
               │
               ▼
┌──────────────────────────────────────────┐
│     Bootstrap 5.3 Frontend (MPA)         │
│                                          │
│  Overview │ Advisories │ Offices │ Map   │
│  Notices  │ Filters    │ Sources         │
│                                          │
│  Leaflet maps · CSV/PDF export           │
└──────────────────────────────────────────┘
```

Data flows from NOAA every 15 minutes through the ingestor, which matches alerts to offices via UGC zone/county codes, deduplicates using VTEC event tracking, and stores normalized advisories in MySQL/MariaDB. The Express API serves cached, compressed JSON to a multi-page Bootstrap frontend.

## What It Looks Like in Action

**Scenario:** A hurricane watch is issued for the Gulf Coast. Your organization has 40 offices in the affected region.

1. **Dashboard alerts you immediately** — The overview page shows the spike in active advisories, with impacted office counts updated in real time after each 15-minute ingestion cycle.

2. **Drill into impacted offices** — The Offices page filters to show only locations with active hurricane, flood, or storm surge advisories. Each office shows its current operational status (Open, At Risk, or Closed).

3. **Map view for geographic context** — The interactive map clusters affected offices by severity, letting you see at a glance which regions are most impacted and plan response accordingly.

4. **Office detail for local conditions** — Click any office to see its full advisory list, current weather observations from the nearest NWS station, and the complete NOAA alert narrative.

5. **Export for leadership briefing** — Generate a CSV or formatted summary of all impacted offices and their advisory status to share with senior leadership or emergency response teams.

## Use Cases

- **Operations center during hurricane season** — An operations team monitors 200+ locations across the Gulf Coast. Instead of checking weather.gov for each site, Storm Scout surfaces all active hurricane warnings, flood watches, and storm surge alerts in a single view, filtered to only the severity levels that trigger action.

- **Go/no-go closure decisions for multi-location businesses** — A regional manager needs to decide which offices to close ahead of a winter storm. Storm Scout's office status page shows exactly which locations have active blizzard warnings or ice storm advisories, enabling consistent closure decisions across the network.

- **Executive briefing generation** — A director needs to update senior leadership on weather impact across the organization. Storm Scout's export feature generates a formatted briefing summarizing impacted locations, active alert counts by severity, and current conditions — ready to send without manual data gathering.

- **Field service scheduling around severe weather** — A dispatch team coordinates technicians across multiple states. Storm Scout's map view and advisory filters help identify which service areas have active weather threats, allowing dispatchers to reschedule appointments proactively rather than reactively.

## ✨ Features

### Core Functionality
- **300 Demo Locations** - Ships with a realistic 300-location dataset of US offices spanning all 50 states and territories, identified by 5-digit zip codes. [Swap for your own locations](#adapting-for-your-organization) via CSV import in minutes.
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
- **UI Verification Test** - 22 automated checks validating all 9 frontend pages are served with correct DOM elements, all 8 API dependencies return valid data, and data integrity constraints hold (300 offices, active advisories, severity values, filter levels)
- **Deterministic Builds** - `npm ci` (not `npm install`) in all deploy paths ensures package-lock.json is honored
- **Automated Migrations** - `npm run migrate` runs idempotent migrations before app restart on every deploy; `APPLY_MIGRATIONS=false` escape hatch available
- **CI Pipeline** - GitHub Actions runs `npm ci`, `npm audit --audit-level=high`, and `npm test` on every push and pull request
- **Liveness vs Readiness** - `/ping` (no I/O, always 200) for supervisor keep-alive; `/health` (may 503) for readiness monitoring
- **Test Suite** - Jest unit and integration tests for advisory model dedup paths, API key middleware, and advisories route; `supertest` for HTTP-level assertions
- **UI Verification** - curl-based page and API dependency validation across all 9 frontend pages (22 checks)

### Global Architecture (Planned)
- **Multi-Country Design** - Adapter pattern for ECCC (Canada), MeteoAlarm (EU), SMN (Mexico)
- **Expert Reviewed** - 5-expert panel review with 16 findings, all critical items remediated

---

> **For Developers:** Everything below covers setup, configuration, and deployment. If you're evaluating Storm Scout from a business or operations perspective, the sections above tell the full story.

## Quick Start

> **Terminology:** Throughout this documentation, "locations" and "offices" refer to the same 300 monitored facilities. The codebase and API use "office" consistently.

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
```

#### Option A: Quick Start with Demo Data (recommended)

Storm Scout ships with 300 pre-populated US office locations in `backend/src/data/offices.json`. To get running immediately:

```bash
npm run seed-db
npm start
```

That's it — the dashboard is live at **http://localhost:3000** and will begin ingesting NOAA weather data every 15 minutes.

#### Option B: Import Your Own Locations

To use your own office locations, prepare a CSV file and import it:

```bash
node src/scripts/import-offices.js /path/to/your-locations.csv
npm run seed-db
npm start
```

**CSV format requirements:**

| Column | Required | Description |
|--------|----------|-------------|
| `zip` | Yes | 5-digit zip code (used as `office_code`) |
| `name` | Yes | Office name |
| `city` | Yes | City name |
| `state` | Yes | 2-letter state code |
| `latitude` | Yes | Decimal latitude |
| `longitude` | Yes | Decimal longitude |
| `region` | Optional | Region name |
| `county` | Optional | County name (used for UGC matching) |
| `ugc_codes` | Optional | JSON array string, e.g. `["TXZ123","TXC456"]` |
| `cwa` | Optional | NWS County Warning Area code |

Example header: `zip,name,city,state,latitude,longitude,region,county`

The import **overwrites** `backend/src/data/offices.json` on each run. Rows missing required fields are skipped with a warning. Run summary prints total rows processed, rows skipped, and output path.

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
│   │   ├── scripts/     # Maintenance scripts (office import, station mapping)
│   │   └── data/        # Schema, offices.json (300 locations), migrations/
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
**Data:** NOAA Weather API (94 alert types, 1140 observation stations), 300 office locations
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
- `GET /api/offices` - All 300 offices
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

# UI verification (22 checks — pages, API deps, data integrity; requires running server)
cd backend && bash scripts/ui-verify.sh

# Deploy via rsync to target server
DEPLOY_HOST=your-server.example.com DEPLOY_USER=youruser ./deploy.sh
```

See `DEPLOY.md` for detailed deployment instructions.

## Adapting for Your Organization

Storm Scout is designed to be forked and customized. Any set of US locations with latitude/longitude coordinates will work — swap the data, and you have a working dashboard for your sites.

**Key customization points:**

1. **Replace the office list** — Prepare a CSV with your locations (zip, name, city, state, latitude, longitude) and run `node src/scripts/import-offices.js /path/to/your-locations.csv` to generate a new `backend/src/data/offices.json`. Run `npm run seed-db` to load them.

2. **Adjust alert type filtering** — Edit `backend/src/config/noaa-alert-types.js` to change which of the 94 NOAA alert types are enabled by default and how they map to impact levels (CRITICAL, HIGH, MODERATE, LOW, INFO).

3. **Customize filter presets** — Modify the built-in presets (Office Default, Operations View, Executive Summary, etc.) to match your organization's alert monitoring needs.

4. **Extend the schema** — Add custom columns (region, cost center, district) to the `offices` table and include them in your import CSV for organization-specific grouping and reporting.

From CSV to working dashboard in about 15 minutes. See [`DEPLOY.md`](DEPLOY.md) for full setup instructions.

**Multi-tenant potential:** The current architecture is single-tenant by design — one database, one set of offices, one ingestion pipeline. Multi-tenant support (serving multiple organizations from a single deployment) would require tenant-scoped database queries, per-tenant authentication, and isolated ingestion schedules. The Express middleware layer and existing API key model provide a natural starting point for this extension.

## POC Scope

The following are intentional scope boundaries for this proof-of-concept, not missing features. Each reflects a deliberate trade-off to keep the project focused and deployable.

| Area | Scope Decision | Rationale |
|------|---------------|-----------|
| **Geographic coverage** | US only | NOAA Weather API covers the 50 US states and territories. International adapters (Environment Canada, MeteoAlarm, SMN) are designed for but not yet implemented. |
| **User authentication** | Network-level | The dashboard is open to anyone with the URL. Access is controlled via reverse proxy or VPN. The API uses key-based authentication for write operations. |
| **Architecture** | Single-tenant | One database, one ingestion pipeline, one organization. See [multi-tenant potential](#adapting-for-your-organization) above. |
| **Frontend tests** | Backend only | Backend has 162 automated tests (Jest + supertest). The frontend has zero test coverage — a deliberate trade-off for the no-build-step architecture. See [`CONTRIBUTING.md`](CONTRIBUTING.md#test-coverage-notes) for rationale. |
| **Infrastructure cost** | Minimal | Runs on a single VPS ($5-10/month). No paid API dependencies — NOAA data is free and public domain. |

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

**Reporting vulnerabilities:** See [`SECURITY.md`](SECURITY.md) for our security policy.

**Security documentation:** See `docs/security/` for detailed guides, vulnerability tracking, dependency override rationale, and secret rotation policy.

**Architecture & scale:** See `docs/ARCHITECTURE.md` for system overview, scale ceilings, and pre-500-location upgrade requirements.

**Database schema reference:** See [`docs/DATA-DICTIONARY.md`](docs/DATA-DICTIONARY.md) for complete column definitions, enumerations, and table relationships.

**Frontend development:** See [`docs/FRONTEND-GUIDE.md`](docs/FRONTEND-GUIDE.md) for page structure, state management, XSS safety requirements, and the guide to adding new pages.

**Quick reference:** See [`docs/QUICK-REFERENCE.md`](docs/QUICK-REFERENCE.md) for a developer cheat sheet of CLI commands, environment variables, and curl examples.

## Data Sources

Storm Scout uses exclusively public domain data from the US federal government:

- **NOAA/NWS Weather API** ([api.weather.gov](https://api.weather.gov)) — All weather alerts, warnings, advisories, and observation data. NOAA data is US government work and in the public domain. No API key is required — the only requirement is a `User-Agent` header with a contact email, per NOAA's [API documentation](https://www.weather.gov/documentation/services-web-api). There are no usage fees or rate limits beyond reasonable use.

- **Office locations** — The monitored locations in `backend/src/data/offices.json` are user-provided via CSV import. See [Adapting for Your Organization](#adapting-for-your-organization) for how to load your own locations.

## Development Story

Storm Scout was built by a technical operations leader — not a software engineer — using AI-assisted development with [Claude Code](https://claude.ai). The entire project, from first commit to production deployment, was developed through human-AI collaboration: the human directed architecture decisions, defined requirements, and managed the project backlog while AI generated the code, tests, and documentation.

The project has been developed across 180+ GitHub issues and 300+ commits over approximately one month. Every commit carries a `Co-Authored-By: Claude Opus 4.6` trailer — this is intentional transparency about the development methodology, not an afterthought. Features like security hardening, accessibility, circuit breaker patterns, and the VTEC deduplication system were all specified by the human developer and implemented through iterative AI-assisted coding sessions.

This project serves as a case study in what's possible when domain expertise (operations management, weather monitoring workflows) meets AI-assisted software development — a production-grade application built by someone who understands the problem deeply but relied on AI tooling to write the code.

The codebase is vanilla JavaScript with no TypeScript — a deliberate choice. When AI writes all the code, TypeScript's core value proposition (helping human developers catch type errors and navigate unfamiliar code) becomes irrelevant. AI agents handle the correctness that TypeScript would normally enforce, while vanilla JS eliminates build complexity and keeps the frontend servable as static files.

See [`docs/DEVELOPMENT-PROCESS.md`](docs/DEVELOPMENT-PROCESS.md) for the full methodology: AI tooling choices, human-AI collaboration workflow, quality assurance approach, and lessons learned.

## License

MIT &mdash; see [LICENSE](LICENSE) for the full text and [NOTICE.md](NOTICE.md) for third-party attributions.

## Privacy & Analytics

Storm Scout does not include analytics by default. The `frontend/js/analytics.js` file is a placeholder. If you deploy this application and add analytics, you are responsible for implementing an appropriate consent mechanism and privacy policy for your deployment context. Request logs capture IP addresses and User-Agent strings for rate limiting and security monitoring purposes.
