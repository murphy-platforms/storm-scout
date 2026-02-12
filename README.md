# Storm Scout

**A site-focused weather advisory dashboard for IMT and Operations teams**

Storm Scout consolidates active weather advisories and operational signals by location to help quickly identify which testing centers may be impacted and support go/no-go decisions during severe weather events.

## 🚀 Live Production Site

**https://your-domain.example.com**

Currently monitoring 219 testing centers with real-time NOAA weather data updated every 15 minutes.

## ✨ Features

- **219 US Testing Center Locations** - Monitors sites across all 50 states and US territories
- **Real-Time NOAA Weather Data** - Automatic ingestion of weather alerts every 15 minutes
- **Site Operational Status** - Automatically calculated (Open/At Risk) based on advisory severity
- **Multiple Advisory Sources** - Currently NOAA/NWS, with support for state/local emergency notices
- **Clean, Responsive UI** - Bootstrap 5.3 dashboard optimized for desktop and tablet
- **Production Deployed** - Running on Node.js 20 with MySQL/MariaDB backend

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
    ├── sources.html     # Data sources
    ├── css/style.css
    └── js/
        ├── api.js       # API client
        └── utils.js     # Helpers
```

## 🛠 Tech Stack

**Backend:** Node.js 20, Express, MySQL/MariaDB, mysql2, node-cron, axios  
**Frontend:** HTML5, Bootstrap 5.3, Vanilla JavaScript  
**Data:** NOAA Weather API, 219 US testing centers  
**Deployment:** cPanel with Passenger, SSH/rsync

## Development

### Manual Data Ingestion
```bash
cd backend
npm run ingest
```

### Reset Database
```bash
cd backend
# Drop and recreate database in MySQL, then:
npm run init-db
npm run seed-db
```

### Run Manual Ingestion
```bash
cd backend
npm run ingest
```

See `backend/README.md` for complete API documentation.

## License

MIT
