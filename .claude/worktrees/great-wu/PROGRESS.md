# Storm Scout - Deployment Progress

## ✅ Completed

### Infrastructure Setup
- ✅ Created FTP deployment script (`deploy-ftp.sh`)
- ✅ Configured macOS Keychain for secure password storage
- ✅ Set up FTP connection to Spaceship.com hosting
- ✅ Configured cPanel Node.js 20 environment

### Deployment System
- ✅ FTP deployment working with `lftp`
- ✅ Files successfully uploaded to server
- ✅ Node.js application configured in cPanel
- ✅ Environment variables set in cPanel

### Database Setup
- ✅ Created MySQL/MariaDB database: `***REDACTED***`
- ✅ Created database user: `***REDACTED***`
- ✅ Verified MySQL connection (MariaDB 11.4.9)

### MySQL Migration (Completed)
- ✅ Updated `package.json`: replaced `sql.js` with `mysql2`
- ✅ Rewrote `database.js` for MySQL connection pooling
- ✅ Converted `schema.sql` from SQLite to MySQL syntax
- ✅ Converted `seed.sql` from SQLite to MySQL syntax
- ✅ Updated `config.js` with MySQL credentials structure
- ✅ Updated `.env` files with MySQL configuration
- ✅ Fixed SQL parsing to handle comment lines properly
- ✅ Converted site model and routes to async/await
- ✅ Created MySQL-compatible stubs for advisory and siteStatus models
- ✅ Set up SSH access with key-based authentication

## ❌ Issues Encountered

### SQLite Compatibility Problems
1. **better-sqlite3**: Requires GLIBC 2.29 (server has older version)
2. **sql.js**: Out of memory - WebAssembly instantiation failed on shared hosting

## 🎯 Current Status

**✅ FULLY DEPLOYED AND OPERATIONAL**

**Production Site:** https://your-domain.example.com

**On Server:**
- Database: `***REDACTED***` (MariaDB 11.4.9) - ✅ Schema created, 219 sites loaded
- Backend API: ✅ Running with all endpoints functional
- Frontend: ✅ Dashboard accessible and operational
- Node.js: ✅ Running on version 20.20.0
- SSH Access: ✅ Configured for deployment
- NOAA Ingestion: ✅ Running every 15 minutes (431 active advisories)

**FTP Upload Paths:**
- FTP uploads to: `/home/mwqtiakilx/your-domain.example.com/stormscout/`
- Node.js app expects: `/home/mwqtiakilx/storm-scout/`
- Must copy files: `cp -r ~/your-domain.example.com/stormscout/* ~/storm-scout/`

## 📋 Completed Deployment Steps

1. ✅ Configured SSH access with Ed25519 key
2. ✅ Deployed backend files via SSH/rsync
3. ✅ Installed mysql2 and dependencies
4. ✅ Initialized MySQL database schema
5. ✅ Seeded database with 219 testing center sites
6. ✅ Started Node.js application
7. ✅ Verified API endpoints working

## 🎯 Working Endpoints

**Sites:**
- ✅ `GET /api/sites` - Returns all 219 sites
- ✅ `GET /api/sites/:id` - Get site by ID  
- ✅ `GET /api/sites?state=XX` - Filter by state
- ✅ `GET /api/sites/states` - Get list of states
- ✅ `GET /api/sites/regions` - Get list of regions

**Advisories:**
- ✅ `GET /api/advisories` - Get all active advisories (431 currently)
- ✅ `GET /api/advisories?severity=Severe` - Filter by severity
- ✅ `GET /api/advisories?site_id=X` - Filter by site
- ✅ `GET /api/advisories/:id` - Get specific advisory

**Status:**
- ✅ `GET /api/status/overview` - Dashboard statistics
- ✅ `GET /api/status/sites` - All site statuses
- ✅ `GET /api/status/sites-impacted` - Sites at risk (90 currently)

**System:**
- ✅ `GET /health` - Health check
- ✅ `GET /api` - API information
- ✅ `GET /` - Frontend dashboard (HTML)

## ✅ Completed Conversions

### Backend Models (All MySQL async/await)
- ✅ `site.js` - Site data access
- ✅ `advisory.js` - Weather advisory management
- ✅ `notice.js` - System notices  
- ✅ `siteStatus.js` - Operational status tracking

### Routes
- ✅ All routes converted to async/await
- ✅ Sites routes fully functional
- ✅ Advisories routes fully functional
- ✅ Status routes fully functional
- ✅ Notices routes fully functional

### Data Ingestion
- ✅ NOAA API integration working
- ✅ Ingestion code converted to MySQL
- ✅ Scheduler running every 15 minutes
- ✅ 432 alerts → 436 advisories → 101 sites impacted

### Frontend
- ✅ All files deployed to public_html
- ✅ API endpoint URLs updated for production
- ✅ Static file serving configured in Express
- ✅ Dashboard accessible at root domain
- ✅ All pages functional (Dashboard, Sites, Advisories, Notices, Sources)

## 🔑 Server Details

**Hosting:** Spaceship.com (cPanel with Node.js support)
- **Server:** ***REDACTED_HOST***
- **Node.js:** 20.20.0
- **Database:** MariaDB 11.4.9-cll-lve

**SSH/FTP:**
- Host: `***REDACTED_HOST***`
- SSH Port: `21098`
- FTP Port: `21`
- User: `mwqtiakilx` (SSH), `stormscout@your-domain.example.com` (FTP)
- SSH Alias: `stormscout`

**MySQL:**
- Host: `localhost`
- Database: `***REDACTED***`
- User: `***REDACTED***`

**Paths:**
- Application root: `storm-scout`
- Startup file: `src/server.js`
- Frontend: Lives in FTP root (your-domain.example.com domain root)

## 📚 Documentation Created

- `DEPLOYMENT.md` - Full VPS deployment guide
- `DEPLOYMENT-CPANEL.md` - cPanel-specific deployment
- `DEPLOY.md` - Quick deployment guide
- `deploy-ftp.sh` - Automated FTP deployment script
- `.ftpconfig` - FTP configuration (not in git)
- `PROGRESS.md` - This file

## 🚀 Why MySQL?

MySQL/MariaDB is the best choice for this hosting environment:
- ✅ Already installed and available in cPanel
- ✅ No native compilation needed
- ✅ Better performance for concurrent connections
- ✅ More suitable for production web applications
- ✅ Standard for shared hosting environments
- ✅ Better tooling and management via phpMyAdmin

## 📝 Notes

- Local development uses Node 20 LTS via Homebrew
- SSH access not available (FTP-only deployment)
- Frontend files uploaded separately from backend
- cPanel auto-manages node_modules in virtual environment
