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
- **Quick Presets** - Site Default, Operations View, Executive Summary, Safety Focus, Full View
- **Persistent Preferences** - Filter settings saved to localStorage and applied across all pages
- **Real-Time Recalculation** - Counts and impacted offices update based on active filter preferences

### User Interface
- **Clean, Responsive UI** - Bootstrap 5.3 dashboard optimized for desktop and tablet
- **6 Dashboard Pages** - Overview, Active Advisories, Offices Impacted, Notices, Filter Settings, Sources
- **Filter-Aware Display** - All pages respect user's filter preferences for consistent data views
- **Alert Detail Modal** - View full NOAA narrative descriptions with "View Full Alert" button on office detail pages
- **Enhanced Alert Cards** - Office detail page shows alert headline, *WHAT description, *WHEN timing, issued time, and source extracted from NOAA descriptions
- **Multiple Advisory Sources** - Currently NOAA/NWS, with support for state/local emergency notices

### Version & Release
- **Version Display** - Footer on all pages shows version number and release date
- **API Endpoint** - `GET /api/version` returns current version from `package.json`
- **GitHub Releases** - Tagged releases with `v` prefix convention (e.g., `v1.7.5`)

### Performance & Security
- **In-Memory Caching** - node-cache for ~100x faster API responses on cache hits
- **API Rate Limiting** - 500 requests/15 min general, 20/15 min for write operations
- **Input Validation** - All API endpoints validated and sanitized with express-validator
- **Security Headers** - helmet.js with CSP, HSTS, X-Frame-Options, X-Content-Type-Options
- **XSS Prevention** - Secure `html` tagged template for safe dynamic HTML rendering
- **CDN Integrity** - Subresource Integrity (SRI) hashes on all external resources
- **Cache-Control Headers** - HTML always revalidates (`no-cache`); static assets cached 7 days with versioned URLs
- **Ingestion Status API** - `/health` exposes real-time ingestion state; `X-Data-Age` header on all API responses

### Deployment
- **Production Ready** - Running on Node.js 20 with MySQL/MariaDB backend
- **Database Optimization** - UPSERT operations prevent duplicate advisories, unique indexes on external IDs
- **Safe Deploys** - `deploy.sh` pauses ingestion before rsync, resumes after restart
- **Pre-Deploy Smoke Test** - 11 automated checks including API validation and XSS audit

### Global Architecture (Planned)
- **Multi-Country Design** - Adapter pattern for ECCC (Canada), MeteoAlarm (EU), SMN (Mexico)
- **Expert Reviewed** - 5-expert panel review with 16 findings, all critical items remediated

## Quick Start

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
**Middleware:** node-cache (caching), express-rate-limit, express-validator
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

- `GET /api/status/overview` - Dashboard statistics (with filter-aware frontend calculations)
- `GET /api/advisories/active` - All active advisories
- `GET /api/offices` - All 300 USPS offices
- `GET /api/status/offices-impacted` - Offices with Closed or At Risk status
- `GET /api/filters` - Available filter presets
- `GET /api/filters/types/all` - All NOAA alert types by impact level
- `GET /api/observations` - Current weather observations for all offices
- `GET /api/observations/:officeCode` - Weather observation for a specific office

See `backend/README.md` for complete API documentation.

## Filter Configuration

The default filter preset is **"Site Default" (CUSTOM)** with 47 of 94 alert types enabled:

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

## Security

Storm Scout implements multiple security controls:

| Control | Implementation | Documentation |
|---------|---------------|---------------|
| XSS Prevention | `html` tagged template in `js/utils.js` | `docs/security/SECURE-TEMPLATES.md` |
| Security Headers | helmet.js in `app.js` | CSP, HSTS, X-Frame-Options |
| CDN Integrity | SRI hashes on all CDN resources | `docs/security/SRI.md` |
| Input Validation | express-validator on all endpoints | `backend/src/validators/` |
| Rate Limiting | express-rate-limit (500 req/15 min) | `backend/src/middleware/rateLimiter.js` |

**Security Assessments:** Point-in-time security audits are stored in `docs/security/assessments/`.

**Reporting vulnerabilities:** See `.github/SECURITY.md` for our security policy.

**Security documentation:** See `docs/security/` for detailed guides and vulnerability tracking.

## License

MIT
