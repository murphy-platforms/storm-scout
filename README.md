# Storm Scout

**A site-focused weather advisory dashboard for IMT and Operations teams**

Storm Scout consolidates active weather advisories and operational signals by location to help quickly identify which testing centers may be impacted and support go/no-go decisions during severe weather events.

## 🚀 Live Production Site

**https://teammurphy.rocks**

Currently monitoring 219 testing centers with real-time NOAA weather data updated every 15 minutes.

## ✨ Features

### Core Functionality
- **219 US Testing Center Locations** - Monitors sites across all 50 states and US territories
- **Real-Time NOAA Weather Data** - Automatic ingestion of weather alerts every 15 minutes
- **Automated Advisory Cleanup** - Removes duplicate and expired advisories after each ingestion
- **Site Operational Status** - Automatically calculated (Open/Closed/At Risk) based on advisory severity
- **Live Update Tracking** - Dashboard displays last update timestamp and countdown to next refresh

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
- **Multiple Advisory Sources** - Currently NOAA/NWS, with support for state/local emergency notices

### Deployment
- **Production Ready** - Running on Node.js 20 with MySQL/MariaDB backend
- **Database Optimization** - UPSERT operations prevent duplicate advisories, unique indexes on external IDs

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

# Load 219 US testing center sites
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
│   │   ├── models/      # Data access layer
│   │   ├── routes/      # REST API endpoints
│   │   ├── ingestion/   # NOAA data fetching
│   │   └── data/        # Schema, sites.json (220 US sites)
│   ├── package.json
│   └── README.md
│
└── frontend/            # Bootstrap 5.3 UI
    ├── index.html       # Overview dashboard
    ├── advisories.html  # Active advisories
    ├── sites.html       # Sites impacted
    ├── notices.html     # Government notices
    ├── filters.html     # Filter configuration
    ├── sources.html     # Data sources
    ├── css/style.css
    └── js/
        ├── api.js           # API client
        ├── utils.js         # Helpers
        └── alert-filters.js # Shared filter logic
```

## 🛠 Tech Stack

**Backend:** Node.js 20, Express, MySQL/MariaDB, mysql2, node-cron, axios  
**Frontend:** HTML5, Bootstrap 5.3, Vanilla JavaScript, localStorage API  
**Data:** NOAA Weather API (80+ alert types), 219 US testing centers  
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

See `backend/README.md` for complete API documentation.

## Filter Configuration

The default filter preset is **"Site Default" (CUSTOM)** with 51 out of 68 alert types enabled:

- **CRITICAL**: 6/12 enabled (Hurricane, Ice Storm, Severe Thunderstorm, Typhoon, Tsunami, Blizzard)
- **HIGH**: 12/14 enabled (excludes Gale Warning, Red Flag Warning)
- **MODERATE**: 6/14 enabled (Flood Watch, Winter Storm Watch/Advisory, Heat Advisory, Tropical Storm Watch, Lake Effect Snow)
- **LOW**: 0/15 enabled (all disabled)
- **INFO**: 0/13 enabled (all disabled)

Users can customize their filter preferences at **/filters.html**, and changes are automatically applied across all dashboard pages.

## Deployment

Production deployment to https://teammurphy.rocks:

```bash
# Deploy backend
rsync -avz -e "ssh -p 21098" --exclude='node_modules' --exclude='.env' backend/ user@host:~/storm-scout/

# Deploy frontend
rsync -avz -e "ssh -p 21098" frontend/ user@host:~/public_html/

# Restart app
ssh user@host "touch ~/storm-scout/tmp/restart.txt"
```

## License

MIT
