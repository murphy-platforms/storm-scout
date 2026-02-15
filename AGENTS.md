# AGENTS.md - Storm Scout Project Context

**Project**: Storm Scout  
**Purpose**: Site-focused weather advisory dashboard for IMT and Operations teams  
**Production URL**: https://your-domain.example.com  
**Status**: Phase 1 Complete, Production Deployed  
**Last Updated**: 2026-02-15

---

## Project Overview

Storm Scout is a weather advisory monitoring system that consolidates active NOAA weather alerts and operational signals by location to help testing center operations teams quickly identify which of the 219 US testing centers may be impacted during severe weather events.

### Key Capabilities
- **Real-time NOAA Data**: Automatic ingestion every 15 minutes from NOAA Weather API
- **219 Testing Centers**: Monitoring sites across all 50 US states and territories
- **Smart Filtering**: 80+ NOAA alert types with 4 severity levels (Extreme, Severe, Moderate, Minor)
- **Operational Status**: Automatically calculated (Open/Closed/At Risk) based on advisory severity
- **Duplicate Prevention**: Multi-level deduplication using external_id, VTEC event IDs, and VTEC codes
- **Filter Presets**: Site Default, Operations View, Executive Summary, Safety Focus, Full View
- **Data Integrity**: Database CHECK constraint enforces valid severity values
- **In-Memory Caching**: node-cache for fast API responses (~100x faster on cache hits)
- **API Rate Limiting**: 100 requests/15 min general, 20/15 min for writes (express-rate-limit)
- **Input Validation**: All API endpoints validated with express-validator
- **Alert Detail Modal**: View full NOAA narrative descriptions on site-detail page

---

## Tech Stack

### Backend
- **Runtime**: Node.js 20 LTS (required for production server)
- **Framework**: Express.js 4.18
- **Database**: MySQL 8.0+ / MariaDB 11.4.9 (async/await with mysql2)
- **Scheduling**: node-cron for 15-minute ingestion cycles
- **HTTP Client**: axios with rate limiting (500ms) and retry logic
- **Caching**: node-cache for in-memory API response caching
- **Validation**: express-validator for input sanitization
- **Rate Limiting**: express-rate-limit for API protection
- **Dependencies**: express, cors, mysql2, node-cron, axios, dotenv, node-cache, express-validator, express-rate-limit

### Frontend
- **UI Framework**: Bootstrap 5.3
- **JavaScript**: Vanilla JS (no framework), ES6+ features
- **State Management**: localStorage for filter preferences
- **API Client**: Fetch API with centralized error handling

### Data Sources
- **NOAA Weather API**: Primary source for all weather advisories
- **VTEC Codes**: Valid Time Event Code parsing for deduplication
- **UGC Codes**: County/zone codes for precise geo-matching

### Infrastructure
- **Hosting**: cPanel with Passenger on shared hosting
- **Server**: ***REDACTED_HOST***
- **Database**: ***REDACTED*** (MariaDB 11.4.9)
- **Deployment**: rsync over SSH (port REDACTED_PORT)

---

## Architecture

### Project Structure
```
strom-scout/
├── backend/              # Node.js + Express API
│   ├── src/
│   │   ├── app.js              # Express app configuration
│   │   ├── server.js           # Server entry point
│   │   ├── config/
│   │   │   ├── database.js     # MySQL connection pool with retry
│   │   │   ├── noaa-alert-types.js  # Alert taxonomy & filter presets
│   │   │   ├── init-database.js
│   │   │   └── seed-database.js
│   │   ├── models/              # Data access layer (async/await)
│   │   │   ├── site.js
│   │   │   ├── advisory.js
│   │   │   ├── advisoryHistory.js
│   │   │   ├── notice.js
│   │   │   └── siteStatus.js
│   │   ├── routes/              # REST API endpoints
│   │   │   ├── sites.js
│   │   │   ├── advisories.js
│   │   │   ├── notices.js
│   │   │   ├── status.js
│   │   │   └── filters.js
│   │   ├── ingestion/           # Weather data ingestion
│   │   │   ├── noaa-ingestor.js      # Main ingestion with transactions
│   │   │   ├── scheduler.js          # Cron scheduler with alerting
│   │   │   ├── local-ingestor.js     # (Planned: state/local feeds)
│   │   │   └── utils/
│   │   │       ├── api-client.js     # NOAA API with rate limiting/retry
│   │   │       └── normalizer.js     # Alert normalization & VTEC parsing
│   │   ├── middleware/              # Express middleware
│   │   │   ├── rateLimiter.js       # API rate limiting (100/15min, 20/15min writes)
│   │   │   └── validate.js          # Input validation error handler
│   │   ├── validators/              # Route validation rules
│   │   │   ├── common.js            # Shared rules (id, state, limit)
│   │   │   ├── advisories.js
│   │   │   ├── sites.js
│   │   │   ├── notices.js
│   │   │   ├── history.js
│   │   │   └── status.js
│   │   ├── utils/
│   │   │   ├── cache.js             # In-memory caching with node-cache
│   │   │   ├── cleanup-advisories.js # Unified cleanup module
│   │   │   └── alerting.js          # Failure notification system
│   │   ├── scripts/                  # Maintenance scripts
│   │   │   ├── scheduled-cleanup.js
│   │   │   ├── cleanup-duplicates.js
│   │   │   └── backfill-vtec-event-id.js
│   │   └── data/
│   │       ├── schema.sql            # MySQL schema
│   │       ├── sites.json            # 219 testing centers
│   │       └── migrations/
│   └── package.json
│
└── frontend/            # Bootstrap 5.3 UI
    ├── index.html       # Overview dashboard (Classic)
    ├── advisories.html  # Active advisories list
    ├── sites.html       # Sites impacted
    ├── site-detail.html # Individual site view (with alert detail modal)
    ├── map.html         # Interactive map (future)
    ├── notices.html     # Government notices
    ├── filters.html     # Filter configuration
    ├── sources.html     # Data sources
    ├── beta/            # Beta UI (modern design)
    │   ├── index.html   # Operations Dashboard
    │   ├── advisories.html
    │   ├── sites.html
    │   ├── notices.html # Government notices
    │   ├── filters.html
    │   └── css/style.css
    ├── css/style.css
    └── js/
        ├── api.js           # API client (shared by Classic & Beta)
        ├── utils.js         # Helper functions
        ├── alert-filters.js # Shared filter logic
        └── aggregation.js   # Site aggregation utilities
```

### Database Schema

**4 Main Tables**:
1. **sites** - 219 testing center locations (static data)
2. **advisories** - Weather alerts mapped to sites (dynamic, updated every 15 min)
3. **site_status** - Operational status tracking (manual overrides + auto-calculation)
4. **notices** - Government/emergency notices (future feature)
5. **advisory_history** - Snapshots for trend analysis (future feature)

**Key Fields**:
- `external_id` (advisories) - NOAA alert ID, UNIQUE constraint prevents duplicates
- `vtec_event_id` (advisories) - Persistent event ID (e.g., "PAFG.BZ.W.0004")
- `vtec_code` (advisories) - Full VTEC string for deduplication
- `vtec_action` (advisories) - Action code (NEW, CON, EXT, EXP, CAN, UPG)
- `ugc_codes` (sites) - JSON array of UGC codes for precise matching

---

## Development Conventions

### Code Style
- **Async/Await**: All database operations use async/await (no callbacks)
- **Error Handling**: Try/catch blocks with meaningful error messages
- **Logging**: console.log for info, console.error for errors (structured logging planned)
- **Naming**: camelCase for functions/variables, UPPER_CASE for constants
- **Comments**: JSDoc-style comments for public functions (in progress)

### Database Patterns
- **Connection Pool**: Single pool exported from `config/database.js`
- **Transactions**: Use for multi-step operations (especially ingestion)
- **UPSERT**: Use `ON DUPLICATE KEY UPDATE` for advisory updates
- **Indexes**: All foreign keys and filter columns have indexes

### API Conventions
- **RESTful Routes**: `/api/{resource}` or `/api/{resource}/{id}`
- **Query Params**: Use for filtering (e.g., `?state=CA&status=active`)
- **Error Responses**: JSON with `{ error: "message" }` format
- **CORS**: Enabled for all origins (tighten in production if needed)

### Frontend Patterns
- **No Build Step**: Plain HTML/CSS/JS, no bundler
- **Bootstrap Components**: Use Bootstrap 5.3 classes consistently
- **localStorage**: Persist filter preferences as `selectedFilterPreset` and `customFilters`
- **API Calls**: Centralized in `js/api.js`, all routes return JSON

---

## Important Context

### VTEC (Valid Time Event Code)
NOAA uses VTEC codes to uniquely identify weather events. Example:
```
/O.NEW.PAFG.BZ.W.0004.260212T1800Z-260213T0600Z/
```

**Format**: `/O.{ACTION}.{OFFICE}.{PHENOM}.{SIG}.{EVENT}.{START}-{END}/`
- **ACTION**: NEW, CON (continue), EXT (extend), EXP (expire), CAN (cancel), UPG (upgrade)
- **OFFICE**: NWS office code (e.g., PAFG = Fairbanks)
- **PHENOM**: Phenomenon code (e.g., BZ = Blizzard)
- **SIG**: Significance (W = Warning, A = Watch, Y = Advisory)
- **EVENT**: Event number (e.g., 0004 = 4th event of this type this year)

**Deduplication Strategy**:
1. **Primary**: Use `external_id` (NOAA alert ID) - most reliable
2. **Fallback**: Use `vtec_event_id` (persistent across updates)
3. **Last Resort**: Use full `vtec_code` for older alerts

### Multi-Zone Alert Coverage
Sites near forecast zone boundaries (e.g., Anchorage) may receive multiple alerts of the same type from different NWS offices. **This is working as designed** - each alert has a unique `external_id` and represents different geographic coverage. Phase 2 (zone filtering) could optionally reduce these to preferred offices.

### Filter System
- **Site Default (CUSTOM)**: 18 of 80 alert types enabled (most relevant for operations)
- **Operations View**: High severity only
- **Executive Summary**: Critical + High severity
- **Safety Focus**: All safety-related alerts
- **Full View**: All 80+ alert types

Filters are applied **client-side** in the frontend. The API returns all data; frontend filters based on localStorage preferences.

---

## Key Scripts

### Backend Scripts
```bash
# Development
npm start              # Start server (production mode)
npm run dev            # Start with nodemon (auto-restart)

# Database
npm run init-db        # Initialize schema
npm run seed-db        # Load 219 sites

# Data Operations
npm run ingest         # Manual NOAA ingestion
npm run cleanup        # Remove duplicates and expired advisories

# Cleanup Modes
node src/utils/cleanup-advisories.js full       # All cleanup steps
node src/utils/cleanup-advisories.js vtec       # VTEC duplicates only
node src/utils/cleanup-advisories.js event_id   # Event ID duplicates only
node src/utils/cleanup-advisories.js expired    # Remove expired only
```

### Deployment
```bash
# One-command deploy (recommended)
./deploy.sh

# Manual backend deploy
rsync -avz -e "ssh -p REDACTED_PORT" --exclude='node_modules' --exclude='.env' backend/ REDACTED_USER@your-domain.example.com:~/storm-scout/

# Manual frontend deploy
rsync -avz -e "ssh -p REDACTED_PORT" frontend/ REDACTED_USER@your-domain.example.com:~/public_html/

# Restart (via cPanel or SSH)
ssh -p REDACTED_PORT REDACTED_USER@your-domain.example.com "touch ~/storm-scout/tmp/restart.txt"
```

---

## Common Tasks

### Adding a New API Endpoint
1. Create handler in appropriate route file (e.g., `routes/advisories.js`)
2. Add route to `app.js` if it's a new router
3. Test locally with curl or Postman
4. Update `backend/README.md` API documentation
5. Add corresponding frontend call in `js/api.js`

### Modifying Database Schema
1. Update `data/schema.sql` with new columns/tables
2. Create migration SQL in `data/migrations/` (e.g., `20260214-add-column.sql`)
3. **DO NOT** run migrations automatically in production
4. Test locally with `npm run init-db`
5. Apply manually on production via SSH or coordinate with DB admin

### Adding a New Filter Preset
1. Edit `config/noaa-alert-types.js`
2. Add new preset to `FILTER_PRESETS` object
3. Restart server to load new config
4. Frontend automatically picks up new preset from `/api/filters`

### Debugging Duplicate Alerts
1. Check if they have unique `external_id` values:
   ```sql
   SELECT external_id, advisory_type, headline, site_id 
   FROM advisories 
   WHERE site_id = 2703 AND advisory_type = 'Blizzard Warning';
   ```
2. If unique external_ids → legitimate multi-zone coverage
3. If duplicate external_ids → check UPSERT logic in `noaa-ingestor.js`
4. Run cleanup: `npm run cleanup`

---

## Roadmap Context

### Completed (Phase 1)
- ✅ VTEC event ID deduplication
- ✅ External ID unique constraint
- ✅ Automated cleanup system
- ✅ Production deployment
- ✅ 219 testing centers loaded
- ✅ 15-minute NOAA ingestion working
- ✅ Severity validation (defaults Unknown to Minor)
- ✅ Database CHECK constraint on severity
- ✅ Composite index for status+severity queries
- ✅ Beta UI with all pages including notices.html
- ✅ In-memory caching with node-cache (status/overview, sites, advisories/active)
- ✅ API rate limiting with express-rate-limit (100 req/15 min, 20 writes/15 min)
- ✅ Input validation with express-validator (all endpoints)

### High Priority (Next)
- [ ] Unit tests (Jest) for models and utilities

### Medium Priority
- [ ] Phase 2: Zone filtering (reduce multi-zone alerts to preferred offices) - 10-12 hours
- [ ] Email notifications for critical events
- [ ] WebSocket support for real-time updates
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Structured logging (Winston or Pino)

### Low Priority
- [ ] Dark mode
- [ ] Data visualization (charts, graphs)
- [ ] Mobile app (React Native)
- [ ] Advanced features (alert correlation, predictive analytics)

See `ROADMAP.md` for full list.

---

## Production Environment

### Server Details
- **Host**: ***REDACTED_HOST***
- **SSH**: `ssh -p REDACTED_PORT REDACTED_USER@your-domain.example.com`
- **cPanel**: https://***REDACTED_HOST***:2083
- **Node.js**: Version 20 LTS (via cPanel Node.js app)
- **Process Manager**: Passenger (cPanel)

### Environment Variables (Production)
Set in cPanel → Node.js app interface:
- `NODE_ENV=production`
- `PORT=3000` (managed by Passenger)
- `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` (MySQL connection)
- `NOAA_API_USER_AGENT=StormScout/1.0 (your-email@example.com)` ⚠️ **REQUIRED**
- `INGESTION_ENABLED=true`
- `INGESTION_INTERVAL_MINUTES=15`
- `ALERT_WEBHOOK_URL` (optional, for Slack notifications)

### Monitoring
- **Health Check**: `curl https://your-domain.example.com/health` (enhanced with database + ingestion status)
- **Logs**: cPanel → Node.js → View Logs
- **Database**: phpMyAdmin in cPanel
- **Ingestion Status**: Check `last_updated` in advisories table

### Database Backup & Disaster Recovery

**Critical Data**: The Storm Scout database (`***REDACTED***`) contains:
- **Static**: 219 testing center locations (sites table) - can be reloaded from `backend/src/data/sites.json`
- **Dynamic**: Active weather advisories (advisories table) - repopulates automatically within 15 minutes
- **Historical**: Advisory snapshots (advisory_history table) - **IRREPLACEABLE** if lost
- **Configuration**: Site status overrides (site_status table) - manual IMT decisions, **CRITICAL** to preserve

**Backup Strategy**:

1. **Automated Daily Backups (cPanel)**
   - **Frequency**: Daily at 2:00 AM EST (configured in cPanel)
   - **Retention**: 7 days (shared hosting default)
   - **Location**: cPanel → Backups → Download Full Backup
   - **Access**: Log into https://***REDACTED_HOST***:2083, navigate to Backups
   - **Restore**: cPanel → Backups → Restore → Select backup file

2. **Manual Weekly Backups (Recommended)**
   - **Frequency**: Every Sunday (or after major changes)
   - **Method**: Export via phpMyAdmin or command line
   - **Storage**: Local machine + offsite (Google Drive, Dropbox, etc.)
   
   ```bash
   # Via SSH (requires password)
   ssh -p REDACTED_PORT REDACTED_USER@your-domain.example.com
   mysqldump -u REDACTED_USER_stormsc -p ***REDACTED*** > stormscout_backup_$(date +%Y%m%d).sql
   
   # Download backup to local machine
   scp -P REDACTED_PORT REDACTED_USER@your-domain.example.com:~/stormscout_backup_*.sql ~/backups/
   ```
   
   Via phpMyAdmin:
   - Log into cPanel → phpMyAdmin
   - Select `***REDACTED***` database
   - Export → Quick → SQL → Go
   - Save `.sql` file locally

3. **Pre-Deployment Backups (Required)**
   - **Always** create a backup before:
     - Database schema changes (migrations)
     - Major version upgrades
     - Bulk data operations
   - Store with deployment notes and git commit hash

**Recovery Procedures**:

1. **Full Database Restore** (Disaster Recovery):
   ```bash
   # Via SSH
   ssh -p REDACTED_PORT REDACTED_USER@your-domain.example.com
   mysql -u REDACTED_USER_stormsc -p ***REDACTED*** < stormscout_backup_YYYYMMDD.sql
   ```
   
   Via phpMyAdmin:
   - cPanel → phpMyAdmin → Import
   - Choose backup `.sql` file
   - Execute
   
   **Post-Restore Steps**:
   - Verify sites count: `SELECT COUNT(*) FROM sites;` (should be 219)
   - Check for active advisories: `SELECT COUNT(*) FROM advisories WHERE status='active';`
   - Restart ingestion: Backend will auto-populate advisories within 15 minutes
   - Verify health: `curl https://your-domain.example.com/health`

2. **Partial Recovery** (Specific Tables):
   - Export single table from backup:
     ```bash
     # Extract specific table from full backup
     sed -n '/DROP TABLE.*`advisory_history`/,/UNLOCK TABLES/p' backup.sql > advisory_history_only.sql
     mysql -u REDACTED_USER_stormsc -p ***REDACTED*** < advisory_history_only.sql
     ```

3. **Data Loss Scenarios**:
   
   | Scenario | Impact | Recovery Time | Steps |
   |----------|--------|---------------|-------|
   | **Sites table lost** | 🔴 Critical - No advisories can be matched | 5 min | Run `npm run seed-db` from backend |
   | **Advisories table lost** | 🟡 Moderate - Data repopulates automatically | 15 min | Next ingestion cycle will rebuild active advisories |
   | **Advisory_history lost** | 🟠 High - Historical trends lost permanently | N/A | Must restore from backup (no auto-recovery) |
   | **Site_status lost** | 🔴 Critical - Manual IMT decisions lost | Varies | Restore from backup; IMT must re-enter manual overrides |
   | **Complete DB loss** | 🔴 Critical - Full outage | 10-15 min | Restore from latest backup, verify, restart |

**Backup Verification**:

Test backups monthly by:
1. Download latest backup
2. Restore to local test database (`storm_scout_test`)
3. Verify table counts and data integrity
4. Document any issues

```bash
# Local restore test
mysql -u root -p storm_scout_test < stormscout_backup_YYYYMMDD.sql
mysql -u root -p storm_scout_test -e "SELECT COUNT(*) FROM sites;"
mysql -u root -p storm_scout_test -e "SELECT COUNT(*) FROM advisories;"
```

**Backup Security**:
- Backups contain **no personally identifiable information (PII)**
- Database passwords should **never** be committed to git or stored in backups
- Store backups encrypted if possible (use GPG or disk encryption)
- Rotate backup files older than 30 days

**Documentation Updates**:
- **Last Backup Verified**: [Add date after testing restore]
- **Backup Location**: [Add your backup storage location]
- **Contact for Restore**: [Add IMT/DevOps contact]

---

## Testing Strategy

### Local Testing
1. Use separate test database: `storm_scout_test`
2. Run ingestion manually: `npm run ingest`
3. Test API endpoints with curl:
   ```bash
   curl http://localhost:3000/api/status/overview
   curl http://localhost:3000/api/sites
   curl http://localhost:3000/api/advisories/active
   ```
4. Open frontend: `open frontend/index.html` (use local server for API calls)

### Pre-Deployment Checklist
- [ ] Code tested locally
- [ ] No console errors in browser
- [ ] API endpoints return expected data
- [ ] Database migrations documented (if any)
- [ ] Git commit with clear message
- [ ] `.env` changes documented (don't commit `.env`)

### Post-Deployment Verification
- [ ] Health check passes: `https://your-domain.example.com/health`
- [ ] Frontend loads: `https://your-domain.example.com`
- [ ] API responds: `https://your-domain.example.com/api/sites`
- [ ] Dashboard shows data (sites, advisories, counts)
- [ ] No errors in cPanel logs

---

## Known Issues & Quirks

### 1. Multi-Zone Alert "Duplicates"
**Issue**: Sites near zone boundaries (e.g., Anchorage site 2703) show multiple alerts of the same type.  
**Root Cause**: Legitimate coverage from multiple NWS offices, each with unique `external_id`.  
**Status**: Working as designed. Phase 2 (zone filtering) would be optional enhancement.

### 2. NOAA API Rate Limiting
**Issue**: NOAA may throttle if too many rapid requests.  
**Mitigation**: Built-in 500ms delay between requests, automatic retry with exponential backoff.  
**User-Agent**: MUST include contact email or NOAA may block requests.

### 3. Expired Advisories
**Issue**: Advisories past their `end_time` may linger briefly.  
**Mitigation**: Cleanup runs after each ingestion cycle, marks as expired and deletes.

### 4. Shared Hosting Limitations
**Issue**: cPanel shared hosting has memory/CPU limits, can't use PM2.  
**Mitigation**: Use Passenger (handles restarts), optimize queries, add Redis caching for high-traffic endpoints.

### 5. Node.js Version Pinning
**Issue**: Production server requires Node.js 20 LTS.  
**Mitigation**: Use `source ~/nodevenv/storm-scout/20/bin/activate` on server, document in deployment scripts.

---

## Troubleshooting Guide

### Backend Won't Start
1. Check MySQL connection: `mysql -u REDACTED_USER_stormsc -p ***REDACTED***`
2. Verify `.env` file exists and has correct values
3. Check Node.js version: `node --version` (should be 20.x)
4. Check for port conflicts: `lsof -i :3000`
5. Review logs: cPanel → Node.js → View Logs

### Ingestion Failing
1. Check User-Agent in `.env`: `NOAA_API_USER_AGENT` must include email
2. Test NOAA API manually: `curl -A "StormScout/1.0 (test@example.com)" https://api.weather.gov/alerts/active`
3. Check database connection (ingestion requires write access)
4. Review logs for specific error messages
5. Run manual ingestion: `npm run ingest`

### Frontend Not Loading Data
1. Check API base URL in `js/api.js` (should be `https://your-domain.example.com` in production)
2. Test API directly: `curl https://your-domain.example.com/api/sites`
3. Check browser console for CORS errors
4. Verify backend is running: `curl https://your-domain.example.com/health`
5. Clear localStorage and refresh: `localStorage.clear()`

### Duplicate Alerts Appearing
1. Check if they have unique `external_id` values (query database)
2. If unique → legitimate multi-zone coverage (working as designed)
3. If duplicate → run cleanup: `npm run cleanup`
4. Check UPSERT logic in `ingestion/noaa-ingestor.js`
5. Verify unique constraint exists: `SHOW INDEX FROM advisories;`

### Deployment Fails
1. Test SSH connection: `ssh -p REDACTED_PORT REDACTED_USER@your-domain.example.com`
2. Check rsync is installed: `which rsync`
3. Verify paths in `.deploy.config.local`
4. Check server disk space: `ssh stormscout "df -h"`
5. Manual deployment as fallback (see `DEPLOY.md`)

---

## Git Workflow

### Branch Strategy
- **main**: Production-ready code, deployed to https://your-domain.example.com
- Feature branches: Create for major features (e.g., `feature/zone-filtering`)
- Hotfix branches: For urgent production fixes (e.g., `hotfix/ingestion-crash`)

### Commit Messages
Use conventional commit format:
```
feat: Add zone filtering to reduce multi-zone alerts
fix: Correct VTEC event ID extraction for Alaska zones
docs: Update AGENTS.md with troubleshooting guide
refactor: Extract VTEC parsing to separate utility
```

### Co-Authorship
When AI assists with commits, include:
```
Co-Authored-By: Warp <agent@warp.dev>
```

---

## Contact & Support

### Key Documentation Files
- `README.md` - Project overview and quick start
- `ROADMAP.md` - Feature priorities and technical debt
- `TODO.md` - Active task list
- `NEXT-STEPS.md` - Phase 1 results and next actions
- `DEPLOY.md` - Deployment instructions
- `backend/README.md` - Backend API documentation
- `CHANGELOG.md` - Version history
- `docs/security/README.md` - Security vulnerability tracking
- `docs/security/SECURE-TEMPLATES.md` - XSS prevention guide
- `docs/security/SRI.md` - CDN integrity hashes
- `docs/security/TRUST-PROXY.md` - Proxy configuration

### Useful Commands
```bash
# Quick status check
git status
npm run ingest  # Test ingestion locally
curl https://your-domain.example.com/health  # Check production

# Database inspection
mysql -u REDACTED_USER_stormsc -p ***REDACTED***
SELECT COUNT(*) FROM advisories WHERE status = 'active';
SELECT site_code, name, COUNT(*) as alert_count 
FROM sites s JOIN advisories a ON s.id = a.site_id 
WHERE a.status = 'active' 
GROUP BY s.id ORDER BY alert_count DESC LIMIT 10;

# Log monitoring
ssh -p REDACTED_PORT REDACTED_USER@your-domain.example.com "tail -f ~/logs/storm-scout.log"
```

---

## Security Best Practices

Storm Scout follows these security patterns established during the February 2026 security remediation. **All new code should adhere to these practices.**

### 1. XSS Prevention (Frontend)

**Never use raw `innerHTML` with dynamic data.** Use the secure `html` tagged template function from `js/utils.js`:

```javascript
// ❌ WRONG - XSS vulnerable
container.innerHTML = `<div>${userData}</div>`;

// ✅ CORRECT - Auto-escaped
container.innerHTML = html`<div>${userData}</div>`;

// ✅ For trusted HTML (badges, icons), use raw()
container.innerHTML = html`<div>${raw(getSeverityBadge(severity))}</div>`;
```

**IMPORTANT: This applies to ALL files that generate HTML**, including:
- HTML pages with inline `<script>` tags
- Standalone JS utility files (e.g., `trends.js`, `export.js`)
- Any code that uses `innerHTML`, `insertAdjacentHTML`, or similar

**For standalone JS files** that can't import `utils.js` (e.g., files that generate downloadable reports), add a local `escapeHtml()` function:

```javascript
// Local escapeHtml for standalone files
escapeHtml(unsafe) {
    if (unsafe == null) return '';
    return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
```

**Key files:**
- `frontend/js/utils.js` - Contains `escapeHtml()`, `raw()`, and `html` tagged template
- `frontend/beta/js/utils.js` - Beta UI version of the same utilities
- `docs/security/SECURE-TEMPLATES.md` - Full documentation

### 2. Security Headers (Backend)

**helmet.js is configured in `app.js`** with:
- Content-Security-Policy (CSP) - Restricts script/style sources
- Strict-Transport-Security (HSTS) - Forces HTTPS
- X-Frame-Options - Prevents clickjacking
- X-Content-Type-Options - Prevents MIME sniffing

**CSP Trade-offs:**
The CSP uses `'unsafe-inline'` for scripts/styles because:
- Google Analytics requires inline scripts
- Bootstrap uses inline styles
- Static HTML files can't use server-generated nonces

**Mitigations in place:**
- `script-src-attr 'none'` - **Blocks inline event handlers** (onclick, onerror) - the primary XSS vector
- `object-src 'none'` - Blocks Flash/plugins
- `base-uri 'self'` - Prevents base tag hijacking
- All user-facing HTML uses the `html` tagged template with escaping

**When adding new external resources:**
1. Add the domain to the appropriate CSP directive in `app.js`
2. Test locally before deploying
3. Check browser console for CSP violations

```javascript
// Example: Adding a new CDN to CSP
scriptSrc: [
  "'self'",
  "cdn.jsdelivr.net",
  "new-cdn.example.com"  // Add new sources here
]
```

### 3. Subresource Integrity (Frontend)

**All CDN resources must include SRI hashes.** When updating Bootstrap or other CDN libraries:

```bash
# Generate SRI hash for any URL
curl -s <URL> | openssl dgst -sha384 -binary | openssl base64 -A
```

```html
<!-- Always include integrity and crossorigin attributes -->
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"
        integrity="sha384-geWF76RCwLtnZ8qwWowPQNguL3RmwHVBC9FhGdlKrxdiJJigb/j/68SIy3Te4Bkz"
        crossorigin="anonymous"></script>
```

**Key files:**
- `docs/security/SRI.md` - Current hashes and update procedures

### 4. Trust Proxy Configuration

**Storm Scout runs behind LiteSpeed proxy.** The `trust proxy` setting in `app.js` ensures:
- Rate limiter sees real client IPs (not proxy IP)
- Logging shows actual user IPs
- IP-based security controls work correctly

```javascript
// Already configured - do not remove
app.set('trust proxy', 1);
```

**Key files:**
- `docs/security/TRUST-PROXY.md` - Configuration details

### 5. Input Validation (Backend)

**All API endpoints use express-validator.** When adding new routes:

```javascript
// In routes/example.js
const { param, query } = require('express-validator');
const validate = require('../middleware/validate');

router.get('/:id',
  param('id').isInt({ min: 1 }),
  validate,  // Always include validation middleware
  async (req, res) => { ... }
);
```

**Key files:**
- `backend/src/validators/` - Validation rules by route
- `backend/src/middleware/validate.js` - Error handler

### 6. Rate Limiting

**API endpoints are rate-limited:**
- General: 100 requests / 15 minutes
- Write operations: 20 requests / 15 minutes

Rate limits are enforced in `middleware/rateLimiter.js`. Adjust thresholds there if needed.

### 7. Dependency Security

**Regularly check for vulnerabilities:**

```bash
cd backend && npm audit
```

**When vulnerabilities are found:**
1. Check if it affects Storm Scout's usage
2. Update to patched version if available
3. Document in commit message with CVE reference

### Security Documentation

All security documentation is in `docs/security/`:
- `README.md` - Vulnerability tracking table
- `SECURE-TEMPLATES.md` - XSS prevention guide
- `SRI.md` - Subresource Integrity hashes
- `TRUST-PROXY.md` - Proxy configuration
- `assessments/` - Point-in-time security assessments

### Security Checklist for New Features

- [ ] Dynamic HTML uses `html` tagged template (not raw `innerHTML`)
- [ ] **Standalone JS files** that generate HTML have `escapeHtml()` protection
- [ ] New API endpoints have input validation
- [ ] External resources include SRI hashes
- [ ] New CDN domains added to CSP in `app.js`
- [ ] No secrets in code (use environment variables)
- [ ] Dependencies checked with `npm audit`

### Periodic Security Audit Checklist

Run quarterly or after major changes:

```bash
# 1. Check dependencies
cd backend && npm audit

# 2. Verify security headers in production
curl -sI https://your-domain.example.com | grep -iE "(strict-transport|x-frame|content-security|x-content-type)"

# 3. Search for unsafe innerHTML patterns
grep -rn "\.innerHTML\s*=" frontend/ --include="*.html" --include="*.js" | grep -v "html\`"

# 4. Verify SRI hashes on CDN resources
curl -s https://your-domain.example.com | grep -E 'integrity="sha'

# 5. Test input validation
curl -s "https://your-domain.example.com/api/advisories?site_id=abc" | jq .error
```

**Document findings** in `docs/security/assessments/` with date-stamped reports.

---

## AI Assistant Guidelines

When working on Storm Scout:

1. **Always check current state first**: Run `git status`, check database schema, review existing code before making changes.

2. **Respect existing patterns**: Follow the async/await style, use the connection pool from `config/database.js`, maintain RESTful API conventions.

3. **Test before deploying**: Run locally, test API endpoints, verify database changes before suggesting deployment.

4. **Document changes**: Update README files, add comments to complex logic, create migration files for schema changes.

5. **Be cautious with production**: Never commit `.env` files, always exclude `node_modules` from rsync, test SSH connection before deployment.

6. **Consider operational impact**: Changes affecting ingestion or cleanup should be thoroughly tested - they run every 15 minutes in production.

7. **Explain trade-offs**: When suggesting features (e.g., Phase 2 zone filtering), outline effort, impact, and potential downsides.

8. **Check dependencies**: Storm Scout uses specific versions (Node 20, Bootstrap 5.3, MySQL 8) - ensure compatibility.

9. **Follow the roadmap**: Prioritize high-priority items from `ROADMAP.md` unless user specifies otherwise.

10. **Provide context**: When investigating issues, share relevant code snippets, database queries, and log excerpts to help the user understand.

---

**This file is for AI assistants working on Storm Scout. Keep it updated as the project evolves.**
