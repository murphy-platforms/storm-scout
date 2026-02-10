# Storm Scout

**A site-focused weather advisory dashboard for IMT and Operations teams**

Storm Scout consolidates active weather advisories and operational signals by location to help quickly identify which testing centers may be impacted and support go/no-go decisions during severe weather events.

## Features

- **220 US Testing Center Locations** - Monitors sites across all 50 states and US territories
- **Real-Time NOAA Weather Data** - Automatic ingestion of weather alerts every 15 minutes
- **Site Operational Status** - Automatically calculated (Open/Closed/At Risk) based on advisory severity
- **Multiple Advisory Sources** - Currently NOAA/NWS, with support for state/local emergency notices
- **Clean, Responsive UI** - Bootstrap 5.3 dashboard optimized for desktop and tablet

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- Git

### 1. Backend Setup

```bash
cd backend
npm install

# Configure environment
cp .env.example .env
# Edit .env and set your email in NOAA_API_USER_AGENT

# Initialize database with US site locations
npm run init-db

# (Optional) Add sample weather data for testing
npm run seed-db

# Start the API server
npm start
```

Backend runs at: **http://localhost:3000**

### 2. Frontend Setup

```bash
# In a new terminal
cd frontend

# Serve with any static file server:
python3 -m http.server 8080
# OR: npx http-server -p 8080
# OR: php -S localhost:8080
```

Frontend at: **http://localhost:8080**

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

## Tech Stack

**Backend:** Node.js, Express, SQLite, node-cron, axios  
**Frontend:** HTML5, Bootstrap 5.3, Vanilla JavaScript  
**Data:** NOAA Weather API, 220 US testing centers

## Development

### Manual Data Ingestion
```bash
cd backend
npm run ingest
```

### Reset Database
```bash
cd backend
rm storm-scout.db*
npm run init-db
npm run seed-db
```

See `backend/README.md` for complete API documentation.

## License

MIT
