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
- ✅ Created MySQL/MariaDB database: `mwqtiakilx_stormscout`
- ✅ Created database user: `mwqtiakilx_stormscout`
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

**✅ DEPLOYED AND RUNNING**

**On Server:**
- Database: `mwqtiakilx_stormscout` (MariaDB 11.4.9) - ✅ Schema created, 219 sites loaded
- Backend API: ✅ Running at https://teammurphy.rocks
- Node.js: ✅ Running on version 20.20.0
- SSH Access: ✅ Configured for deployment

**FTP Upload Paths:**
- FTP uploads to: `/home/mwqtiakilx/teammurphy.rocks/stormscout/`
- Node.js app expects: `/home/mwqtiakilx/storm-scout/`
- Must copy files: `cp -r ~/teammurphy.rocks/stormscout/* ~/storm-scout/`

## 📋 Completed Deployment Steps

1. ✅ Configured SSH access with Ed25519 key
2. ✅ Deployed backend files via SSH/rsync
3. ✅ Installed mysql2 and dependencies
4. ✅ Initialized MySQL database schema
5. ✅ Seeded database with 219 testing center sites
6. ✅ Started Node.js application
7. ✅ Verified API endpoints working

## 🎯 Working Endpoints

- ✅ `GET /health` - Health check
- ✅ `GET /api/sites` - Returns all 219 sites
- ✅ `GET /api/sites/:id` - Get site by ID
- ✅ `GET /api/sites/states` - Get list of states
- ✅ `GET /api/sites/regions` - Get list of regions
- ✅ `GET /api/status/overview` - Dashboard statistics
- ✅ `GET /api/status/sites` - Site statuses

## 📋 Remaining Work

### Backend
- ⏳ Complete conversion of advisories routes/model to MySQL
- ⏳ Complete conversion of notices routes/model to MySQL
- ⏳ Re-enable disabled routes in app.js
- ⏳ Set up NOAA weather data ingestion
- ⏳ Configure ingestion scheduler

### Frontend
- ⏳ Deploy frontend files to public_html
- ⏳ Update API endpoint URLs in frontend
- ⏳ Test dashboard UI
- ⏳ Configure proper routing

## 🔑 Server Details

**Hosting:** Spaceship.com (cPanel with Node.js support)
- **Server:** server37.shared.spaceship.host
- **Node.js:** 20.20.0
- **Database:** MariaDB 11.4.9-cll-lve

**SSH/FTP:**
- Host: `server37.shared.spaceship.host`
- SSH Port: `21098`
- FTP Port: `21`
- User: `mwqtiakilx` (SSH), `stormscout@teammurphy.rocks` (FTP)
- SSH Alias: `stormscout`

**MySQL:**
- Host: `localhost`
- Database: `mwqtiakilx_stormscout`
- User: `mwqtiakilx_stormscout`

**Paths:**
- Application root: `storm-scout`
- Startup file: `src/server.js`
- Frontend: Lives in FTP root (teammurphy.rocks domain root)

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
