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

## ❌ Issues Encountered

### SQLite Compatibility Problems
1. **better-sqlite3**: Requires GLIBC 2.29 (server has older version)
2. **sql.js**: Out of memory - WebAssembly instantiation failed on shared hosting

## 🎯 Current Status

**On Server:**
- Database: `mwqtiakilx_stormscout` (MariaDB 11.4.9) - empty, ready
- Files: Deployed to `/home/mwqtiakilx/storm-scout/`
- Node.js: Configured but not running (waiting for MySQL conversion)

**FTP Upload Paths:**
- FTP uploads to: `/home/mwqtiakilx/teammurphy.rocks/stormscout/`
- Node.js app expects: `/home/mwqtiakilx/storm-scout/`
- Must copy files: `cp -r ~/teammurphy.rocks/stormscout/* ~/storm-scout/`

## 📋 Next Steps: MySQL Migration

### Code Changes Required
1. Update `package.json`: Replace `sql.js` with `mysql2`
2. Rewrite `src/config/database.js` for MySQL connection pooling
3. Convert SQL schemas from SQLite to MySQL syntax
4. Update all models for MySQL compatibility
5. Add MySQL credentials to environment configuration

### Deployment Steps After Conversion
1. Test MySQL version locally (requires local MySQL)
2. Deploy updated code via FTP
3. Copy files to correct location on server
4. Run npm install in cPanel
5. Initialize MySQL database with schema
6. Seed with sample data
7. Start Node.js application
8. Test at https://teammurphy.rocks

## 🔑 Server Details

**Hosting:** Spaceship.com (cPanel with Node.js support)
- **Server:** server37.shared.spaceship.host
- **Node.js:** 20.20.0
- **Database:** MariaDB 11.4.9-cll-lve

**FTP:**
- Host: `server37.shared.spaceship.host:21`
- User: `stormscout@teammurphy.rocks`

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
