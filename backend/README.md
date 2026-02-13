# Storm Scout Backend API

Node.js + Express backend for Storm Scout weather advisory dashboard.

## Tech Stack

- **Runtime**: Node.js 20 LTS (recommended) or 18+
- **Framework**: Express.js
- **Database**: MySQL 8.0+ / MariaDB 10.5+ (async/await with mysql2)
- **Scheduling**: node-cron
- **HTTP Client**: axios (with rate limiting and retry logic)

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

# MySQL Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=storm_scout
DB_PASSWORD=your_secure_password
DB_NAME=storm_scout

# NOAA Ingestion
INGESTION_ENABLED=true
INGESTION_INTERVAL_MINUTES=15
# IMPORTANT: User-Agent is REQUIRED - use your real email!
NOAA_API_USER_AGENT=StormScout/1.0 (your-email@yourcompany.com)

# Alerting (optional - for failure notifications)
# ALERT_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz

# Frontend Static Files (for production)
STATIC_FILES_PATH=/path/to/frontend/directory
```

### 3. Create MySQL Database

Create a MySQL/MariaDB database:

```sql
CREATE DATABASE storm_scout;
CREATE USER 'storm_scout'@'localhost' IDENTIFIED BY 'your_secure_password';
GRANT ALL PRIVILEGES ON storm_scout.* TO 'storm_scout'@'localhost';
FLUSH PRIVILEGES;
```

### 4. Initialize Database Schema

```bash
npm run init-db
```

This creates all tables with proper indexes.

### 5. Load Testing Center Sites

```bash
npm run seed-db
```

This loads all 219 US testing center locations into the database.

### 6. Start the Server

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

### Filters

- `GET /api/filters` - Get all filter presets
- `GET /api/filters/:filterName` - Get specific filter preset
- `GET /api/filters/types/all` - Get all NOAA alert types by impact level
- `GET /api/filters/types/:level` - Get alert types for specific impact level

## Data Ingestion

### Automatic Ingestion

When `INGESTION_ENABLED=true`, the server automatically fetches weather data from NOAA every N minutes (configured by `INGESTION_INTERVAL_MINUTES`).

### Manual Ingestion

To manually trigger data ingestion:

```bash
npm run ingest
```

### Advisory Cleanup

The unified cleanup module supports multiple modes:

```bash
# Full cleanup (all modes)
npm run cleanup

# Or run specific cleanup modes:
node src/utils/cleanup-advisories.js full       # All cleanup steps
node src/utils/cleanup-advisories.js vtec       # VTEC code duplicates only
node src/utils/cleanup-advisories.js event_id   # Event ID duplicates only
node src/utils/cleanup-advisories.js expired    # Remove expired only
node src/utils/cleanup-advisories.js duplicates # All duplicate types
```

Cleanup features:
- **Batched deletes** - Processes in chunks of 1000 to avoid performance issues
- **Race condition handling** - Uses transactions and `SELECT ... FOR UPDATE`
- **Multiple deduplication strategies** - external_id, VTEC event ID, VTEC code, type
- **Automatic alerts** - Sends Slack/webhook notifications on cleanup failures

### Data Sources

Currently implemented:
- **NOAA Weather API** - 80+ alert types covering all official weather alerts
- **Alert Taxonomy** - 5 impact levels (CRITICAL, HIGH, MODERATE, LOW, INFO)
- **UPSERT Operations** - Prevents duplicate advisories using unique external_id index
- **Rate Limiting** - 500ms between NOAA API requests to prevent throttling
- **Retry Logic** - Automatic retries with exponential backoff for transient failures

### Geo-Matching

Site-to-alert matching uses hierarchical precision:
1. **UGC Codes** (most precise) - Direct zone/county code matching
2. **County Name** - Fallback to county-level matching
3. **State** (least precise) - Fallback when no specific match found

To enable precise matching, populate `ugc_codes` and `county` fields in the sites table.

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
│   ├── config/
│   │   ├── config.js       # App configuration
│   │   ├── database.js     # MySQL connection pool (with retry logic)
│   │   └── noaa-alert-types.js # Filter presets & alert taxonomy
│   ├── models/            # Data access layer (async/await)
│   │   ├── site.js
│   │   ├── advisory.js
│   │   ├── advisoryHistory.js  # Trend analysis snapshots
│   │   ├── notice.js
│   │   └── siteStatus.js
│   ├── routes/            # API routes
│   │   ├── sites.js
│   │   ├── advisories.js
│   │   ├── notices.js
│   │   ├── status.js
│   │   └── filters.js      # Filter configuration API
│   ├── ingestion/         # Weather data ingestion
│   │   ├── noaa-ingestor.js    # Main ingestion with transactions
│   │   ├── scheduler.js        # Cron scheduler with alerting
│   │   └── utils/
│   │       ├── api-client.js   # NOAA API with rate limiting/retry
│   │       └── normalizer.js   # Alert normalization & VTEC parsing
│   ├── utils/
│   │   ├── cleanup-advisories.js # Unified cleanup module
│   │   └── alerting.js          # Failure notification system
│   ├── scripts/           # Maintenance scripts
│   │   ├── scheduled-cleanup.js    # Cron-friendly cleanup
│   │   ├── cleanup-duplicates.js   # (deprecated - uses unified module)
│   │   └── cleanup-event-id-duplicates.js # (deprecated)
│   └── data/              # Static data and schema
│       ├── schema.sql     # Full schema with all columns
│       ├── migrations/    # SQL migration files
│       └── sites.json     # 219 testing centers
├── package.json
└── README.md
```

## Development

### Database Reset

To reset the database:

```sql
-- In MySQL:
DROP DATABASE storm_scout;
CREATE DATABASE storm_scout;
```

```bash
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
2. Configure MySQL with appropriate connection limits
3. Set `STATIC_FILES_PATH` to serve frontend from Express
4. Use cPanel Passenger or PM2 for process management
5. Set up SSL/TLS (handled by cPanel in current deployment)
6. Deploy with rsync:

```bash
# Backend
rsync -avz -e "ssh -p REDACTED_PORT" --exclude='node_modules' --exclude='.env' backend/ user@host:~/storm-scout/

# Restart (cPanel Passenger)
ssh user@host "touch ~/storm-scout/tmp/restart.txt"
```

## Troubleshooting

### NOAA API Rate Limits

NOAA doesn't require an API key but requires a proper User-Agent. Make sure `NOAA_API_USER_AGENT` includes your contact email. The API client includes:
- Automatic retry with exponential backoff (3 retries)
- Rate limiting (500ms between requests)
- Proper handling of 429 (Too Many Requests) responses

### MySQL Connection Issues

If you see connection errors:
- Verify MySQL credentials in `.env`
- Check MySQL is running: `mysql --version`
- Ensure user has proper permissions
- Verify database exists: `SHOW DATABASES;`

The database pool includes automatic retry for transient failures (ECONNREFUSED, ETIMEDOUT, etc.).

### Duplicate Advisory Warnings

If you see "Duplicate entry" errors:
- This is normal - advisories with the same external_id are updated via UPSERT
- The cleanup module handles deduplication at multiple levels:
  - `external_id` (NOAA alert ID)
  - `vtec_event_id` (persistent event identifier)
  - `vtec_code` (full VTEC string)
  - `advisory_type` per site (keeps most severe)

### Alerting Configuration

To receive alerts on ingestion/cleanup failures:

1. Set `ALERT_WEBHOOK_URL` in `.env` to your Slack webhook URL
2. Alerts are sent for:
   - First ingestion failure
   - 3+ consecutive ingestion failures
   - Anomaly detection (sites with >15 advisories)
   - Cleanup failures

Alerts are throttled to prevent spam (5 min minimum between alerts of same type).

## License

MIT
