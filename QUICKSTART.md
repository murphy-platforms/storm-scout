# Storm Scout - Quick Start Guide

Get Storm Scout up and running in 5 minutes!

## Prerequisites

- Node.js 20 LTS (recommended) - Install via: `brew install node@20`
- Python 3 (for frontend dev server)

## Step 1: Install Backend Dependencies

```bash
cd backend

# If using Node 20 LTS via Homebrew, add to PATH:
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"

npm install
```

> **Note:** Node 20 LTS is recommended for native module compatibility (better-sqlite3)

## Step 2: Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and set your email:
```
NOAA_API_USER_AGENT=StormScout/1.0 (your-email@example.com)
```

## Step 3: Initialize Database

```bash
npm run init-db
```

This loads 964 US testing center locations.

## Step 4: (Optional) Add Sample Data

For testing with pre-populated weather data:

```bash
npm run seed-db
```

## Step 5: Start Backend Server

```bash
npm start
```

You should see:
```
╔══════════════════════════════════════════════════════╗
║  Storm Scout API Server                             ║
╠══════════════════════════════════════════════════════╣
║  Environment: development                            ║
║  Port:        3000                                   ║
║  API URL:     http://localhost:3000                  ║
╚══════════════════════════════════════════════════════╝

✓ Weather data ingestion enabled (every 15 minutes)
```

Backend is now running! **Keep this terminal open.**

## Step 6: Start Frontend

Open a **NEW terminal window/tab**:

```bash
cd frontend

# Choose one:
python3 -m http.server 8080
# OR: npx http-server -p 8080
# OR: php -S localhost:8080
```

## Step 7: Open Storm Scout

Open your browser to:

**http://localhost:8080**

You should see the Storm Scout dashboard!

> **Important:** Both servers must be running simultaneously:
> - Backend (port 3000) - Provides API data
> - Frontend (port 8080) - Serves web interface

## What You'll See

### With Sample Data (if you ran seed-db):
- Overview dashboard with summary cards
- Sample weather advisories for FL, IL, MA, TX
- Sites marked as Closed/At Risk
- Government notices

### Without Sample Data:
- Dashboard showing 1029 total sites
- No active advisories (unless NOAA has real alerts)
- All sites marked as "Open"

## Testing Real Data

To fetch real weather alerts from NOAA:

```bash
cd /Users/mmurphy/strom-scout/backend
npm run ingest
```

This manually triggers data collection. The server also does this automatically every 15 minutes when running.

## Troubleshooting

### "Cannot connect to backend"
- Check backend is running: http://localhost:3000/health
- Should return: `{"status":"ok","timestamp":"...","environment":"development"}`

### "No data showing"
- If no sample data: Run `npm run seed-db` in backend directory
- Check browser console (F12) for errors

### Port already in use
- Backend port 3000 in use: Change `PORT=3001` in `.env`
- Frontend port 8080 in use: Use different port like `8081`

## Next Steps

1. **Explore the Pages:**
   - Overview: Dashboard summary
   - Active Advisories: Filterable table
   - Sites Impacted: Cards for affected sites
   - Notices: Government declarations
   - Sources: Data source information

2. **Customize:**
   - Add/edit sites: `backend/src/data/sites.json`
   - Change update frequency: `INGESTION_INTERVAL_MINUTES` in `.env`
   - Modify styling: `frontend/css/style.css`

3. **Production:**
   - See `backend/README.md` for deployment guide
   - Use PostgreSQL instead of SQLite
   - Set up nginx reverse proxy
   - Configure SSL/TLS

## API Endpoints

Test these in your browser or with curl:

- http://localhost:3000/api/sites
- http://localhost:3000/api/advisories/active
- http://localhost:3000/api/status/overview
- http://localhost:3000/api/notices/active

All return JSON: `{"success": true, "data": [...]}`

## Support

See full documentation:
- Project README: `/Users/mmurphy/strom-scout/README.md`
- Backend docs: `/Users/mmurphy/strom-scout/backend/README.md`

---

**You're all set! Storm Scout is ready to monitor weather advisories for your testing centers.** 🌩️
