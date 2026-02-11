# Storm Scout - Task List

## 🎯 Project Status
**Backend API:** ✅ Deployed and running  
**Frontend UI:** ⏳ Not yet deployed  
**Database:** ✅ MySQL with 219 sites loaded  
**Live URL:** https://teammurphy.rocks

---

## 📋 High Priority Tasks

### 1. Complete Backend Model Conversions
**Priority:** HIGH  
**Status:** ⏳ In Progress

Convert remaining models from SQLite to MySQL async/await:

- [ ] Convert `advisory.js` model completely
  - Replace all `db.prepare()` calls with `db.query()`
  - Make all methods async
  - Update all routes that use this model
  
- [ ] Convert `notice.js` model completely
  - Replace all `db.prepare()` calls with `db.query()`
  - Make all methods async
  - Update all routes that use this model

- [ ] Re-enable routes in `app.js`
  - Uncomment advisories route
  - Uncomment notices route
  - Test all endpoints

**Files to Update:**
- `backend/src/models/advisory.js`
- `backend/src/models/notice.js`
- `backend/src/routes/advisories.js`
- `backend/src/routes/notices.js`
- `backend/src/app.js`

---

### 2. Deploy Frontend
**Priority:** HIGH  
**Status:** ⏳ Not Started

- [ ] Review frontend files in `frontend/` directory
- [ ] Update API base URL in `frontend/js/api.js`
  - Change from `http://localhost:3000` to `https://teammurphy.rocks`
- [ ] Deploy frontend files to server
  ```bash
  rsync -avz -e "ssh -p 21098" frontend/ mwqtiakilx@66.29.148.111:~/public_html/
  ```
- [ ] Test frontend loads at https://teammurphy.rocks
- [ ] Verify API calls from frontend work
- [ ] Test all dashboard pages:
  - [ ] Home/Dashboard
  - [ ] Sites page
  - [ ] Advisories page
  - [ ] Notices page
  - [ ] Sources page

**Files to Update:**
- `frontend/js/api.js` (API endpoint URL)

---

### 3. Weather Data Ingestion
**Priority:** MEDIUM  
**Status:** ⏳ Not Started

Set up automated weather data collection from NOAA:

- [ ] Review ingestion code in `backend/src/ingestion/`
- [ ] Update ingestion code for MySQL if needed
- [ ] Test NOAA API integration
  ```bash
  npm run ingest
  ```
- [ ] Configure ingestion scheduler
  - Default: runs every 15 minutes
  - Check `INGESTION_INTERVAL_MINUTES` in `.env`
- [ ] Enable ingestion in production
  - Set `INGESTION_ENABLED=true` in cPanel environment variables
- [ ] Monitor first few ingestion cycles
- [ ] Verify data appears in database

**Files to Review:**
- `backend/src/ingestion/noaa-ingestor.js`
- `backend/src/ingestion/scheduler.js`
- `backend/src/ingestion/run-ingestion.js`

---

## 🔧 Medium Priority Tasks

### 4. Testing & Validation
**Priority:** MEDIUM  
**Status:** ⏳ Not Started

- [ ] Test all API endpoints systematically
  - [ ] Sites endpoints
  - [ ] Advisories endpoints (after conversion)
  - [ ] Notices endpoints (after conversion)
  - [ ] Status endpoints
- [ ] Load test with multiple concurrent requests
- [ ] Test error handling
- [ ] Verify data integrity in MySQL
- [ ] Test with real NOAA weather alerts

---

### 5. Documentation Updates
**Priority:** MEDIUM  
**Status:** ⏳ In Progress

- [ ] Update README.md with:
  - [ ] Deployment status
  - [ ] Live URL
  - [ ] API documentation
  - [ ] Frontend usage instructions
- [ ] Document MySQL setup process
- [ ] Add troubleshooting guide
- [ ] Document SSH deployment workflow
- [ ] Create API endpoint documentation

---

### 6. Code Cleanup
**Priority:** LOW  
**Status:** ⏳ Not Started

- [ ] Remove backup files from repository
  - `backend/src/config/database-sqljs-backup.js`
  - `backend/src/config/database-sqljs.js`
  - `backend/src/data/schema-sqlite.sql.backup`
  - `backend/src/data/seed-sqlite.sql.backup`
  - `backend/src/data/seed.sql.bak`
  
- [ ] Remove stub files once full models are converted
  - `backend/src/models/advisory-mysql-stub.js`
  - `backend/src/models/siteStatus-mysql-stub.js`
  - `backend/src/models/notice-mysql-stub.js`

- [ ] Remove unused deployment files
  - `storm-scout-backend-mysql.tar.gz`
  - `convert-models.sh`
  - `debug-init.js`

---

## 🚀 Enhancement Ideas (Future)

### 7. Performance Optimization
- [ ] Add database query caching
- [ ] Optimize site geolocation queries
- [ ] Add API response compression
- [ ] Implement rate limiting

### 8. Monitoring & Logging
- [ ] Set up application logging
- [ ] Monitor database performance
- [ ] Track API usage statistics
- [ ] Set up error alerting

### 9. Security Enhancements
- [ ] Review CORS settings
- [ ] Add API authentication (if needed)
- [ ] Regular security audits
- [ ] Keep dependencies updated

### 10. Features
- [ ] Add email notifications for severe weather
- [ ] Create mobile-responsive design
- [ ] Add data export functionality
- [ ] Historical weather data tracking

---

## 📝 Deployment Workflow

### Quick Deploy Backend Changes
```bash
# Via SSH (recommended)
cd /Users/mmurphy/strom-scout
rsync -avz -e "ssh -p 21098" \
  --exclude='node_modules' \
  --exclude='.env' \
  --exclude='*.db*' \
  backend/ mwqtiakilx@66.29.148.111:~/storm-scout/

# Restart app in cPanel Node.js interface
```

### Quick Deploy Frontend Changes
```bash
cd /Users/mmurphy/strom-scout
rsync -avz -e "ssh -p 21098" \
  frontend/ mwqtiakilx@66.29.148.111:~/public_html/
```

### Database Operations
```bash
# Connect via SSH
ssh stormscout

# Activate Node environment
cd ~/storm-scout
source ~/nodevenv/storm-scout/20/bin/activate

# Run database scripts
npm run init-db    # Initialize schema
npm run seed-db    # Seed sample data
npm run ingest     # Manual weather data ingestion
```

---

## 🎯 Success Criteria

The project will be considered complete when:

- [x] Backend API running on production server
- [x] MySQL database populated with sites data
- [ ] Frontend deployed and accessible
- [ ] All API endpoints working (sites, advisories, notices, status)
- [ ] Weather data ingestion working automatically
- [ ] Dashboard displaying real weather advisories
- [ ] No critical bugs or errors
- [ ] Documentation up to date

---

## 📞 Support & Resources

- **Server:** server37.shared.spaceship.host
- **SSH:** `ssh stormscout` (port 21098)
- **cPanel:** https://server37.shared.spaceship.host:2083
- **API:** https://teammurphy.rocks
- **Database:** mwqtiakilx_stormscout (MariaDB 11.4.9)

**Created:** 2026-02-11  
**Last Updated:** 2026-02-11
