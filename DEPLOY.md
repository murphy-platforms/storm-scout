# Storm Scout - Deployment Guide

## Environment Overview

| Component | Technology | Auto-Start |
|-----------|-----------|------------|
| Database | MariaDB 11 (Docker) | `docker restart=unless-stopped` |
| Backend API | Node.js 18+, Express | `systemd` user service |
| Frontend | Static files served by Express | same process as backend |

### Reverse Proxy Requirement

This application **must** run behind a reverse proxy (LiteSpeed on cPanel shared hosting, or Nginx/Apache on a VPS). The proxy:

- Terminates TLS (HTTPS)
- Rewrites the `X-Forwarded-For` header with the real client IP
- Forwards requests to the Node.js process on `localhost:3000`

Set `TRUST_PROXY=true` in `.env.production` when a reverse proxy is confirmed. This tells Express to trust the `X-Forwarded-For` header for accurate IP-based rate limiting.

**Do not set `TRUST_PROXY=true` if the Node.js process is exposed directly to the internet** — doing so allows clients to spoof their IP address and bypass rate limiting.

---

## First-Time Setup

### 1. Start the Database (Docker)

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

The `--restart unless-stopped` policy means Docker will restart the container automatically on system reboot (as long as the Docker service itself is enabled, which it is).

### 2. Configure the Backend

```bash
cd backend
cp .env.example .env
# Edit .env — set DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, NOAA_API_USER_AGENT
```

### 3. Initialize the Database

```bash
cd backend
npm install
npm run init-db     # applies schema.sql
npm run seed-db     # loads offices.json + sample notices
```

Apply any pending migrations manually:

```bash
docker exec -i storm-scout-db mariadb -u storm_scout -plocaldev storm_scout_dev \
  < backend/src/data/migrations/<migration-file>.sql
```

### 4. Import USPS Office Data (one-time)

```bash
node backend/src/scripts/import-usps-offices.js /path/to/usps-locations.csv
# Output: backend/src/data/offices.json (300 offices)
npm run seed-db
```

### 5. Install the systemd Service

```bash
mkdir -p ~/.config/systemd/user
cp deployment/storm-scout-dev.service ~/.config/systemd/user/

systemctl --user daemon-reload
systemctl --user enable --now storm-scout-dev

# Ensure service starts at boot even without an active login session
loginctl enable-linger $USER
```

---

## Daily Operations

### Service Management

```bash
# Status
systemctl --user status storm-scout-dev

# Restart (e.g. after code changes)
systemctl --user restart storm-scout-dev

# Stop / Start
systemctl --user stop storm-scout-dev
systemctl --user start storm-scout-dev
```

### Logs

```bash
# Live log stream (ingestion output, errors)
journalctl --user -u storm-scout-dev -f

# Last 200 lines
journalctl --user -u storm-scout-dev -n 200

# Filter for ingestion events only
journalctl --user -u storm-scout-dev -f | grep -i ingest

# Filter for errors only
journalctl --user -u storm-scout-dev | grep -i error
```

### Verify Ingestion Schedule

On server startup the log will show:

```
✓ Weather data ingestion enabled (every 15 minutes)
Cron expression: */15 * * * *
```

NOAA ingestion runs automatically every 15 minutes. To trigger a manual run:

```bash
cd backend && node src/ingestion/run-ingestion.js
```

---

## Deploying Code Updates

### From local machine (rsync)

```bash
# Pre-deploy smoke test
cd backend && bash scripts/smoke-test.sh

# Deploy backend
rsync -avz --exclude='node_modules' --exclude='.env' --exclude='tmp/' \
  backend/ user@server:/srv/projects/storm-scout-usps/backend/

# Deploy frontend
rsync -avz frontend/ user@server:/srv/projects/storm-scout-usps/frontend/

# Install dependencies and restart
ssh user@server "cd /srv/projects/storm-scout-usps/backend && npm install --production"
ssh user@server "systemctl --user restart storm-scout-dev"
```

Or use the project deploy script (set `DEPLOY_HOST` and `DEPLOY_USER` first):

```bash
DEPLOY_HOST=your-server.example.com DEPLOY_USER=youruser ./deploy.sh
```

### After deploying schema changes

```bash
# Apply migration on server
docker exec -i storm-scout-db mariadb -u storm_scout -p<password> storm_scout_dev \
  < backend/src/data/migrations/<migration-file>.sql

systemctl --user restart storm-scout-dev
```

---

## Post-Deployment Verification

```bash
# Health check (database, ingestion state, data integrity)
curl http://localhost:3000/health

# Confirm 300 offices loaded
curl http://localhost:3000/api/offices | python3 -c \
  "import json,sys; d=json.load(sys.stdin); print(d['count'], 'offices')"

# Overview stats
curl http://localhost:3000/api/status/overview
```

Expected `/health` response:
```json
{
  "status": "ok",
  "checks": {
    "database": { "status": "ok" },
    "ingestion": { "status": "ok" }
  }
}
```

---

## Boot Sequence

On system reboot the startup order is:

1. **Docker** starts (system-level, `systemctl enable docker`)
2. **storm-scout-db** container starts automatically (`restart=unless-stopped`)
3. **User linger session** starts (`loginctl enable-linger`)
4. **storm-scout-dev.service** starts, connects to DB, runs initial ingestion

---

## Troubleshooting

### Service won't start

```bash
journalctl --user -u storm-scout-dev -n 50
# Look for: DB connection errors, port conflicts, missing .env
```

### Database container not running

```bash
docker ps -a | grep storm-scout-db
docker start storm-scout-db
docker logs storm-scout-db --tail 30
```

### Port 3000 already in use

```bash
fuser -k 3000/tcp
systemctl --user start storm-scout-dev
```

### Ingestion not running

```bash
# Check last ingestion time
curl http://localhost:3000/health | python3 -c \
  "import json,sys; d=json.load(sys.stdin); print(d['checks']['ingestion'])"

# Trigger manual ingestion
cd /srv/projects/storm-scout-usps/backend && node src/ingestion/run-ingestion.js
```

### Rate limit hit during testing

The API has a 500 requests/15 min limit. If hit during smoke testing:

```bash
systemctl --user restart storm-scout-dev
```

---

## Environment Variables (`.env`)

| Variable | Description | Example |
|----------|-------------|---------|
| `DB_HOST` | Database host | `localhost` |
| `DB_PORT` | Database port | `3306` |
| `DB_USER` | Database user | `storm_scout` |
| `DB_PASSWORD` | Database password | `localdev` |
| `DB_NAME` | Database name | `storm_scout_dev` |
| `PORT` | API server port | `3000` |
| `NODE_ENV` | Environment | `development` |
| `INGESTION_ENABLED` | Enable NOAA polling | `true` |
| `INGESTION_INTERVAL_MINUTES` | Poll interval | `15` |
| `NOAA_API_USER_AGENT` | NOAA API contact | `(Storm Scout, ops@example.com)` |
| `CORS_ORIGIN` | Allowed CORS origin (required — no default) | `https://your-domain.example.com` |
| `TRUST_PROXY` | Set `true` when behind LiteSpeed/Nginx/Apache reverse proxy | `false` |
