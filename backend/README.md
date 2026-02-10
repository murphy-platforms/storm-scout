# Storm Scout Backend API

Node.js + Express backend for Storm Scout weather advisory dashboard.

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: SQLite3 (better-sqlite3)
- **Scheduling**: node-cron
- **HTTP Client**: axios

## Setup

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Edit `.env` to set your configuration:

```
PORT=3000
NODE_ENV=development
DATABASE_PATH=./storm-scout.db
INGESTION_ENABLED=true
INGESTION_INTERVAL_MINUTES=15
NOAA_API_USER_AGENT=StormScout/1.0 (your-email@example.com)
```

### 3. Initialize Database

```bash
npm run init-db
```

This will:
- Create the database schema
- Load all 220 US testing center locations

### 4. (Optional) Seed with Sample Data

For testing with pre-populated data:

```bash
npm run seed-db
```

### 5. Start the Server

```bash
npm start
```

Or for development with auto-restart:

```bash
npm run dev
```

## API Endpoints

### Sites

- `GET /api/sites` - Get all sites (filters: state, region)
- `GET /api/sites/states` - Get list of states
- `GET /api/sites/regions` - Get list of regions
- `GET /api/sites/:id` - Get site by ID with status and advisories
- `GET /api/sites/:id/advisories` - Get advisories for a site

### Advisories

- `GET /api/advisories` - Get all advisories (filters: status, severity, state)
- `GET /api/advisories/active` - Get active advisories only
- `GET /api/advisories/recent` - Get recently updated advisories
- `GET /api/advisories/stats` - Get advisory statistics
- `GET /api/advisories/:id` - Get advisory by ID

### Status

- `GET /api/status/overview` - Get dashboard overview statistics
- `GET /api/status/sites-impacted` - Get impacted sites (Closed/At Risk)
- `GET /api/status/sites` - Get all site statuses

### Notices

- `GET /api/notices` - Get all government/emergency notices
- `GET /api/notices/active` - Get active notices only
- `GET /api/notices/stats` - Get notice statistics
- `GET /api/notices/:id` - Get notice by ID

## Data Ingestion

### Automatic Ingestion

When `INGESTION_ENABLED=true`, the server automatically fetches weather data from NOAA every N minutes (configured by `INGESTION_INTERVAL_MINUTES`).

### Manual Ingestion

To manually trigger data ingestion:

```bash
npm run ingest
```

### Data Sources

Currently implemented:
- **NOAA Weather API** - Active weather alerts for the US

Planned:
- State emergency management feeds
- County/local emergency notices
- FEMA disaster declarations

## Project Structure

```
backend/
├── src/
│   ├── app.js              # Express app configuration
│   ├── server.js           # Server entry point
│   ├── config/            # Configuration and database
│   ├── models/            # Data access layer
│   ├── routes/            # API routes
│   ├── ingestion/         # Weather data ingestion
│   └── data/              # Static data and schema
├── package.json
└── README.md
```

## Development

### Database Reset

To reset the database:

```bash
rm storm-scout.db*
npm run init-db
npm run seed-db
```

### Testing NOAA Integration

Test NOAA data ingestion without running the full server:

```bash
npm run ingest
```

## Production Deployment

1. Set `NODE_ENV=production` in `.env`
2. Configure appropriate `CORS_ORIGIN`
3. Consider using PostgreSQL instead of SQLite for multi-server deployments
4. Use PM2 or similar for process management
5. Set up reverse proxy (nginx) for SSL/TLS

## Troubleshooting

### NOAA API Rate Limits

NOAA doesn't require an API key but requires a proper User-Agent. Make sure `NOAA_API_USER_AGENT` includes your contact email.

### Database Locked Errors

If you see "database is locked" errors:
- SQLite's WAL mode is enabled by default
- Ensure only one ingestion process runs at a time
- Consider PostgreSQL for high-concurrency scenarios

## License

MIT
