# Storm Scout Quick Reference

Developer cheat sheet — CLI commands, environment variables, API endpoints, and admin operations.

---

## Common CLI Commands

### Backend (run from `backend/`)

| Command | Description |
|---------|-------------|
| `npm ci` | Install dependencies from lock file (use in all deploy paths) |
| `npm start` | Start the API server (production mode) |
| `npm run dev` | Start with nodemon auto-restart (development) |
| `npm test` | Run Jest unit + integration tests |
| `npm run init-db` | Drop and recreate schema (destructive — dev only) |
| `npm run seed-db` | Load offices.json + sample notices into DB |
| `npm run ingest` | Trigger a manual NOAA ingestion run |
| `npm run cleanup` | Remove duplicate and expired advisories |
| `npm run migrate` | Apply pending migrations from `src/data/migrations/` |
| `npm audit --audit-level=high` | Check for high/critical dependency vulnerabilities |

### Import and maintenance scripts

```bash
# Import offices from CSV (overwrites offices.json)
node src/scripts/import-offices.js /path/to/offices.csv

# Check migration status
node src/scripts/run-migrations.js --status

# Manual ingestion run (from backend/)
node src/ingestion/run-ingestion.js
```

### Deployment

```bash
# Pre-deploy smoke test (11 checks including XSS audit)
cd backend && bash scripts/smoke-test.sh

# Deploy via rsync (set env vars first)
DEPLOY_HOST=your-server.example.com DEPLOY_USER=youruser ./deploy.sh
```

### Service management (systemd)

```bash
systemctl --user status storm-scout-dev
systemctl --user restart storm-scout-dev
systemctl --user stop storm-scout-dev
systemctl --user start storm-scout-dev

# Live log stream
journalctl --user -u storm-scout-dev -f

# Last 200 lines
journalctl --user -u storm-scout-dev -n 200
```

### Generate an API key

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Key Environment Variables

Set in `backend/.env` (development) or `backend/.env.production` (production).

| Variable | Default | Purpose |
|----------|---------|---------|
| `DB_HOST` | `localhost` | Database host |
| `DB_PORT` | `3306` | Database port |
| `DB_USER` | *(required)* | Database username |
| `DB_PASSWORD` | *(required)* | Database password |
| `DB_NAME` | *(required)* | Database name |
| `DB_POOL_LIMIT` | `40` | Max DB connection pool size |
| `DB_STATEMENT_TIMEOUT_SECONDS` | `30` | Per-connection query timeout |
| `DB_SSL` | `false` | Enable TLS for remote DB connections |
| `PORT` | `3000` | API server port |
| `NODE_ENV` | `development` | `development` or `production` |
| `API_KEY` | *(required)* | Shared secret for admin and write endpoints |
| `NOAA_API_USER_AGENT` | *(required)* | Contact string for NOAA API (e.g. `(Storm Scout, ops@example.com)`) |
| `INGESTION_ENABLED` | `true` | Enable automatic NOAA polling |
| `INGESTION_INTERVAL_MINUTES` | `15` | Polling interval in minutes |
| `CORS_ORIGIN` | *(required)* | Allowed CORS origin (no default) |
| `TRUST_PROXY` | `false` | Set `true` when behind a reverse proxy |
| `RATE_LIMIT_API_MAX` | `30000` | General API rate limit (requests per 60 min) |
| `RATE_LIMIT_WRITE_MAX` | `20` | Write endpoint rate limit (requests per 15 min) |
| `LOG_FORMAT` | *(unset)* | Set to `json` for structured request logging |
| `APPLY_MIGRATIONS` | `true` | Set to `false` to skip auto-migrations on deploy |

---

## Most-Used API Endpoints

### Health and status

```bash
# Liveness probe (always 200 if Node.js is running)
curl http://localhost:3000/ping

# Readiness check (database, ingestion, data integrity)
curl http://localhost:3000/health | python3 -m json.tool

# Dashboard statistics
curl http://localhost:3000/api/status/overview | python3 -m json.tool
```

### Offices and advisories

```bash
# All 1287 offices
curl http://localhost:3000/api/offices | python3 -c \
  "import json,sys; d=json.load(sys.stdin); print(d['count'], 'offices')"

# Active advisories (full dataset)
curl http://localhost:3000/api/advisories/active | python3 -m json.tool

# Active advisories — paginated
curl "http://localhost:3000/api/advisories/active?page=1&limit=25"

# Active advisories — filtered by severity
curl "http://localhost:3000/api/advisories/active?severity=Extreme,Severe"

# Single advisory by ID
curl http://localhost:3000/api/advisories/123
```

### Trends

```bash
# Trends for all offices (last 7 days)
curl "http://localhost:3000/api/trends?days=7"

# Trend for a specific office
curl "http://localhost:3000/api/trends/42?days=7"
```

### Version

```bash
curl http://localhost:3000/api/version
```

---

## Admin Operations

All admin endpoints require the `X-Api-Key` header. Set `DEPLOY_API_KEY` to your `API_KEY` value.

### Pause/resume ingestion

```bash
# Pause ingestion (waits up to 60s for active cycle to finish)
curl -s -X POST \
  -H "X-Api-Key: $DEPLOY_API_KEY" \
  http://localhost:3000/api/admin/pause-ingestion

# Check scheduler state
curl -s -H "X-Api-Key: $DEPLOY_API_KEY" \
  http://localhost:3000/api/admin/status | python3 -m json.tool

# Resume ingestion
curl -s -X POST \
  -H "X-Api-Key: $DEPLOY_API_KEY" \
  http://localhost:3000/api/admin/resume-ingestion
```

**Status response fields:**
- `running` — scheduler is active
- `activeIngestion` — a cycle is in progress right now
- `consecutiveFailures` — alert if > 0
- `lastIngestionTime` — ISO timestamp of last successful ingestion

### Health check interpretation

| Field | OK value | Action if not OK |
|-------|----------|-----------------|
| `status` | `ok` | If `degraded`, check `checks` for failing component |
| `checks.database.status` | `ok` | Restart MariaDB container; check connection pool |
| `checks.ingestion.consecutiveFailures` | `0` | Check NOAA API reachability; inspect logs |
| `noaaCircuitBreaker.state` | `CLOSED` | If `OPEN`, NOAA is unreachable; waits 60s to retry |

### API key rotation

1. Generate a new key: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Update `API_KEY` in `backend/.env.production` on the server
3. Update `DEPLOY_API_KEY` in your local deploy environment
4. Restart the application: `systemctl --user restart storm-scout-dev`
5. Verify with: `curl -H "X-Api-Key: <new-key>" http://localhost:3000/api/admin/status`

---

## Quick Deployment Steps

Full instructions are in [`DEPLOY.md`](../DEPLOY.md). Summary:

```bash
# 1. Run smoke test locally
cd backend && bash scripts/smoke-test.sh

# 2. Deploy (rsync + restart)
DEPLOY_HOST=your-server.example.com DEPLOY_USER=youruser ./deploy.sh

# 3. Verify deployment
curl https://your-server.example.com/health
curl https://your-server.example.com/api/offices | python3 -c \
  "import json,sys; d=json.load(sys.stdin); print(d['count'], 'offices')"
```

The `deploy.sh` script automatically:
- Calls `POST /api/admin/pause-ingestion` before rsync
- Runs `npm ci` on the server
- Applies pending migrations (`npm run migrate`)
- Restarts the service
- Calls `POST /api/admin/resume-ingestion` after restart (or on error via ERR trap)
