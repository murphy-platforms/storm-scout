# Storm Scout

**A site-focused weather advisory dashboard for IMT and Operations teams**

Storm Scout consolidates active weather advisories and operational signals by location to help quickly identify which testing centers may be impacted and support go/no-go decisions during severe weather events.

## 🚀 Live Production Site

**https://teammurphy.rocks**

Currently monitoring 229 testing centers with real-time NOAA weather data updated every 15 minutes.

## ✨ Features

### Core Functionality
- **229 US Testing Center Locations** - Monitors sites across all 50 states and US territories
- **Real-Time NOAA Weather Data** - Automatic ingestion of weather alerts every 15 minutes
- **Automated Advisory Cleanup** - Removes duplicate and expired advisories after each ingestion
- **Automatic Alert Expiration** - Alerts marked expired when their `end_time` passes (v1.2.1)
- **Site Operational Status** - Automatically calculated (Open/Closed/At Risk) based on advisory severity
- **Live Update Tracking** - Dashboard displays last update timestamp and countdown to next refresh
- **ProInsights Reference Sync** - Recurring CSV import from ProInsights with automated site name and metadata sync
- **Site Name Normalization** - All site names sourced from ProInsights MetroAreaName, displayed in UPPER CASE
- **Weather Observations** - Current conditions from nearest NWS observation station updated every 15 minutes

### Alert Filtering System
- **80+ NOAA Alert Types** - Comprehensive taxonomy covering all official NOAA weather alert types
- **5 Impact Levels** - Alerts categorized as CRITICAL, HIGH, MODERATE, LOW, or INFO
- **Customizable Filters** - Users can enable/disable individual alert types via interactive UI
- **Quick Presets** - Site Default, Operations View, Executive Summary, Safety Focus, Full View
- **Persistent Preferences** - Filter settings saved to localStorage and applied across all pages
- **Real-Time Recalculation** - Counts and impacted sites update based on active filter preferences

### User Interface
- **Clean, Responsive UI** - Bootstrap 5.3 dashboard optimized for desktop and tablet
- **6 Dashboard Pages** - Overview, Active Advisories, Sites Impacted, Notices, Filter Settings, Sources
- **Filter-Aware Display** - All pages respect user's filter preferences for consistent data views
- **Alert Detail Modal** - View full NOAA narrative descriptions with "View Full Alert" button on site detail pages
- **Enhanced Alert Cards** - Site detail page shows alert headline, *WHAT description, *WHEN timing, issued time, and source extracted from NOAA descriptions
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

Create a MySQL/MariaDB database:

```sql
CREATE DATABASE storm_scout;
CREATE USER 'storm_scout'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON storm_scout.* TO 'storm_scout'@'localhost';
FLUSH PRIVILEGES;
```

### 2. Backend Setup

```bash
cd backend

# If using Node 20 LTS via Homebrew:
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"

npm install

# Configure environment
cp .env.example .env
# Edit .env and set:
#   - MySQL connection details (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME)
#   - Your email in NOAA_API_USER_AGENT

# Initialize database with schema
npm run init-db

# Load 229 US testing center sites
npm run seed-db

# Start the API server
npm start
```

Backend runs at: **http://localhost:3000**

The server will automatically start ingesting NOAA weather data every 15 minutes if `INGESTION_ENABLED=true` in your `.env` file.

## Project Structure

```
strom-scout/
├── backend/              # Node.js + Express API
│   ├── src/
│   │   ├── config/      # Database & configuration
│   │   ├── models/      # Data access layer (site, advisory, observation, etc.)
│   │   ├── routes/      # REST API endpoints
│   │   ├── ingestion/   # NOAA alert + observation fetching
│   │   ├── scripts/     # Maintenance scripts (reference import, station mapping)
│   │   └── data/        # Schema, sites.json (229 US sites), migrations/
│   ├── package.json
│   └── README.md
│
└── frontend/            # Bootstrap 5.3 UI
    ├── index.html       # Overview dashboard
    ├── advisories.html  # Active advisories
    ├── sites.html       # Sites impacted
    ├── site-detail.html # Individual site view
    ├── map.html         # Interactive map view
    ├── notices.html     # Government notices
    ├── filters.html     # Filter configuration
    ├── sources.html     # Data sources
    ├── css/style.css
    └── js/
        ├── api.js           # API client
        ├── utils.js         # Helpers
        ├── alert-filters.js # Shared filter logic
        └── aggregation.js   # Site aggregation utilities
```

## 🛠 Tech Stack

**Backend:** Node.js 20, Express, MySQL/MariaDB, mysql2, node-cron, axios  
**Middleware:** node-cache (caching), express-rate-limit, express-validator  
**Frontend:** HTML5, Bootstrap 5.3, Vanilla JavaScript, localStorage API  
**Data:** NOAA Weather API (80+ alert types, 223 observation stations), 229 US testing centers  
**Deployment:** cPanel with Passenger, SSH/rsync  
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
- `GET /api/status/sites-impacted` - Sites with Closed or At Risk status
- `GET /api/filters` - Available filter presets
- `GET /api/filters/types/all` - All NOAA alert types by impact level
- `GET /api/observations` - Current weather observations for all sites
- `GET /api/observations/:siteCode` - Weather observation for a specific site

See `backend/README.md` for complete API documentation.

## Filter Configuration

The default filter preset is **"Site Default" (CUSTOM)** with 12 of 78 alert types enabled:

- **CRITICAL**: 5/12 enabled (Hurricane Warning, Typhoon Warning, Tsunami Warning, Blizzard Warning, Ice Storm Warning)
- **HIGH**: 4/15 enabled (Hurricane Watch, Typhoon Watch, Winter Storm Warning, Tropical Storm Warning)
- **MODERATE**: 3/21 enabled (Winter Storm Watch, Lake Effect Snow Warning, Tropical Storm Watch)
- **LOW**: 0/16 enabled (all disabled)
- **INFO**: 0/14 enabled (all disabled)

Users can customize their filter preferences at **/filters.html**, and changes are automatically applied across all dashboard pages.

## Deployment

Production deployment to https://teammurphy.rocks:

```bash
# One-command deploy (recommended) — pauses ingestion, deploys, resumes
./deploy.sh

# Pre-deploy smoke test (11 checks incl. XSS audit)
cd backend && bash scripts/smoke-test.sh

# Or manual deployment:
rsync -avz -e "ssh -p 21098" --exclude='node_modules' --exclude='.env' backend/ mwqtiakilx@teammurphy.rocks:~/storm-scout/
rsync -avz -e "ssh -p 21098" frontend/ mwqtiakilx@teammurphy.rocks:~/public_html/
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
