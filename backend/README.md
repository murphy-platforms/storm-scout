# Storm Scout Backend

Node.js + Express API server for the Storm Scout weather advisory dashboard.

## Tech Stack

- **Runtime**: Node.js 18+ LTS
- **Framework**: Express.js 4.18
- **Database**: MariaDB 11 (Docker) / MySQL 8.0+, via mysql2
- **Scheduling**: node-cron (15-minute ingestion, 6-hour snapshots)
- **HTTP Client**: axios with rate limiting (500ms) and retry logic
- **Caching**: node-cache (in-memory, ~100x faster on cache hits)
- **Validation**: express-validator on all endpoints
- **Rate Limiting**: express-rate-limit (30,000 req/60 min general, 20/15 min writes)

---

## Setup

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:

```
PORT=3000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=3306
DB_USER=storm_scout
DB_PASSWORD=localdev
DB_NAME=storm_scout_dev

INGESTION_ENABLED=true
INGESTION_INTERVAL_MINUTES=15
# REQUIRED: include your real contact email
NOAA_API_USER_AGENT=(Storm Scout, ops@example.com)

# Optional: Slack/webhook for ingestion failure alerts
# ALERT_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz

STATIC_FILES_PATH=../frontend
```

### 3. Start MariaDB (Docker)

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

### 4. Initialize Database Schema

```bash
npm run init-db
```

### 5. Load Office Data

Import locations from CSV, then seed:

```bash
node src/scripts/import-offices.js /path/to/locations.csv
# Output: src/data/offices.json (300 offices)

npm run seed-db
```

### 6. Start the Server

```bash
npm start
```

Server starts at **http://localhost:3000** and runs initial NOAA ingestion immediately, then every 15 minutes.

---

## API Endpoints

### Offices

- `GET /api/offices` — Get all 300 offices (filters: state, region)
- `GET /api/offices/states` — List of states
- `GET /api/offices/regions` — List of regions
- `GET /api/offices/:id` — Get office by ID with status and advisories
- `GET /api/offices/:id/advisories` — Get advisories for an office

### Advisories

- `GET /api/advisories` — All advisories (filters: status, severity, state)
- `GET /api/advisories/active` — Active advisories only
- `GET /api/advisories/recent` — Recently updated advisories
- `GET /api/advisories/stats` — Advisory statistics
- `GET /api/advisories/:id` — Advisory by ID

### Status

- `GET /api/status/overview` — Dashboard overview statistics
- `GET /api/status/offices-impacted` — Impacted offices (Closed/At Risk)
- `GET /api/status/offices` — All office statuses

### Observations

- `GET /api/observations` — Current weather observations for all offices
- `GET /api/observations/:officeCode` — Observation for a specific office (by zip code)

### Notices

- `GET /api/notices` — All government/emergency notices
- `GET /api/notices/active` — Active notices only
- `GET /api/notices/:id` — Notice by ID

### Filters

- `GET /api/filters` — All filter presets
- `GET /api/filters/types/all` — All 94 NOAA alert types by impact level
- `GET /api/filters/types/:level` — Alert types for a specific impact level

### System

- `GET /health` — Database, ingestion state, data integrity check
- `GET /api/version` — Current version from package.json

---

## npm Scripts

```bash
npm start          # Start server (with ingestion)
npm run dev        # Start with nodemon (auto-restart)
npm run init-db    # Apply schema.sql (creates/updates tables)
npm run seed-db    # Load offices.json + seed.sql sample data
npm run ingest     # Manual NOAA ingestion run
npm run cleanup    # Full advisory deduplication + expiration cleanup
```

---

## Data Ingestion

### Automatic

When `INGESTION_ENABLED=true`, NOAA ingestion runs every 15 minutes automatically via node-cron. On startup:
1. Runs an immediate initial ingestion
2. Schedules recurring ingestion (`*/15 * * * *`)
3. Schedules historical snapshots every 6 hours (`0 */6 * * *`)

### Manual

```bash
npm run ingest
# or: node src/ingestion/run-ingestion.js
```

### Geo-Matching

Office-to-alert matching uses hierarchical precision:
1. **UGC Codes** (most precise) — Direct NWS zone/county code matching
2. **County Name** — Fallback county-level matching
3. **State** — Fallback when no specific zone/county match found

UGC codes are populated in `offices.json` via the CSV import script and stored in the `offices` table.

---

## Project Structure

```
backend/
├── src/
│   ├── app.js                        # Express app configuration
│   ├── server.js                     # Server entry point
│   ├── config/
│   │   ├── config.js                 # App configuration
│   │   ├── database.js               # MySQL pool (retry logic, loadOffices)
│   │   ├── init-database.js          # Schema init + seed runner
│   │   └── noaa-alert-types.js       # Filter presets & alert taxonomy (94 types)
│   ├── models/                       # Data access layer (async/await)
│   │   ├── office.js                 # Office CRUD
│   │   ├── advisory.js               # Advisory CRUD + deduplication queries
│   │   ├── advisoryHistory.js        # Per-office trend snapshots
│   │   ├── observation.js            # Current weather observations (upsert/query)
│   │   ├── notice.js                 # Government notices
│   │   └── officeStatus.js           # Office weather impact + operational status
│   ├── routes/                       # API route handlers
│   │   ├── offices.js
│   │   ├── advisories.js
│   │   ├── observations.js
│   │   ├── notices.js
│   │   ├── status.js
│   │   ├── history.js
│   │   └── filters.js
│   ├── ingestion/                    # Weather data ingestion
│   │   ├── noaa-ingestor.js          # Main ingestion pipeline
│   │   ├── scheduler.js              # Cron scheduler with alerting
│   │   └── utils/
│   │       ├── api-client.js         # NOAA API client (rate limiting, retry)
│   │       └── normalizer.js         # Alert normalization & VTEC parsing
│   ├── utils/
│   │   ├── cleanup-advisories.js     # Unified deduplication + expiration cleanup
│   │   ├── cache.js                  # In-memory caching (node-cache)
│   │   └── alerting.js              # Webhook failure notifications
│   ├── scripts/
│   │   ├── import-offices.js    # Convert CSV → offices.json
│   │   ├── capture-historical-snapshot.js # System-wide + per-office snapshot
│   │   └── scheduled-cleanup.js     # Cron-friendly cleanup entry point
│   └── data/
│       ├── schema.sql                # Full database schema
│       ├── seed.sql                  # Sample notices + default office statuses
│       ├── offices.json              # 300 offices (zip-code based)
│       └── migrations/               # SQL migration files (date-prefixed)
├── .env.example
├── package.json
└── README.md
```

---

## Production Deployment

See `DEPLOY.md` in the project root for full instructions.

Quick reference:

```bash
# Deploy backend
rsync -avz --exclude='node_modules' --exclude='.env' --exclude='tmp/' \
  backend/ $DEPLOY_USER@$DEPLOY_HOST:$APP_ROOT/backend/

ssh $DEPLOY_USER@$DEPLOY_HOST "cd $APP_ROOT/backend && npm install --production"
ssh user@server "systemctl --user restart storm-scout-dev"

# View logs
ssh user@server "journalctl --user -u storm-scout-dev -f"
```

---

## Troubleshooting

### Database connection errors
- Verify Docker container: `docker ps | grep storm-scout-db`
- Start if stopped: `docker start storm-scout-db`
- Check credentials in `.env`

### NOAA API issues
- `NOAA_API_USER_AGENT` must include a valid contact email (NOAA requirement)
- API client retries 3 times with exponential backoff
- Check NOAA availability: `curl https://api.weather.gov/alerts/active`

### Duplicate advisory warnings
- Expected behaviour — UPSERT handles same `external_id` gracefully
- Run `npm run cleanup` to remove stale duplicates

### Rate limit hit during testing
- Limit is 30,000 req/60 min; restart the server to reset: `systemctl --user restart storm-scout-dev`

---

## License

MIT &mdash; see [LICENSE](../LICENSE) for the full text and [NOTICE.md](../NOTICE.md) for third-party attributions.
