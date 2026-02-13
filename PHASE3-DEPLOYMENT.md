# Phase 3 Deployment Guide

## Overview
Phase 3 adds advanced features to Storm Scout including map visualization, historical trend analysis, export/reporting system, and PWA capabilities for mobile users.

**Deployment Date:** February 13, 2026  
**Features:** Map View, Advisory History Tracking, Trend Analysis, Export System, PWA

---

## New Features

### 1. Interactive Map Visualization
- **File:** `frontend/map.html`
- **Technology:** Leaflet.js for interactive mapping
- **Features:**
  - Sites displayed as markers color-coded by severity
  - Pulsing animation for Extreme severity sites
  - Clickable markers showing site details
  - Filter controls for severity levels
  - Summary statistics
  - Automatic zoom to fit all markers
  - Marker counts show number of unique advisories

### 2. Advisory History Tracking System
- **Database:** New `advisory_history` table
- **Backend Files:**
  - `backend/src/data/migrations/add-advisory-history.sql`
  - `backend/src/models/advisoryHistory.js`
  - `backend/src/routes/trends.js`
- **Features:**
  - Automatic snapshot creation during ingestion
  - Trend calculation (worsening/improving/stable)
  - 7-day historical data by default
  - Severity change tracking
  - Advisory count change tracking
  - Duration calculation

### 3. Trend Analysis Component
- **File:** `frontend/js/trends.js`
- **Features:**
  - Trend badges (⬆️ worsening, ⬇️ improving, ➡️ stable)
  - Historical bar charts showing severity over time
  - Site-specific trend sections
  - Comparison metrics (first vs last)
  - Duration tracking

### 4. Export and Reporting System
- **File:** `frontend/js/export.js`
- **Export Formats:**
  - CSV - Raw data export
  - HTML Reports (printable to PDF):
    - Incident Report - Detailed advisory and site list
    - Site Impact Summary - Grouped by severity
    - Executive Briefing - High-level overview
- **Features:**
  - One-click export from any page
  - Formatted, print-ready reports
  - Professional styling
  - Automatic timestamps

### 5. Progressive Web App (PWA)
- **Files:**
  - `frontend/manifest.json` - PWA configuration
  - `frontend/sw.js` - Service worker for offline mode
  - `frontend/js/pwa.js` - PWA registration
- **Features:**
  - Installable on mobile devices
  - Offline mode with cached data
  - Network-first strategy for API calls
  - Cache-first strategy for static assets
  - Custom offline page
  - App shortcuts for quick access
  - Connectivity notifications

---

## Deployment Steps

### Step 1: Database Migration

Run the advisory history migration on the production database:

```bash
# SSH into production server
ssh -p REDACTED_PORT mmurphy@66.29.148.111

# Navigate to backend
cd ~/backend/src/data/migrations

# Run migration
mysql -h localhost -u teamma16_storm -p teamma16_storm_scout < add-advisory-history.sql
```

**Verify migration:**
```sql
mysql -h localhost -u teamma16_storm -p teamma16_storm_scout -e "DESCRIBE advisory_history;"
```

Expected output:
- `id` INT PRIMARY KEY
- `site_id` INT
- `snapshot_time` DATETIME
- `advisory_count` INT
- `highest_severity` VARCHAR(50)
- `highest_severity_type` VARCHAR(100)
- `has_extreme` BOOLEAN
- `has_severe` BOOLEAN
- `has_moderate` BOOLEAN
- `new_count` INT
- `upgrade_count` INT
- `advisory_snapshot` JSON
- `created_at` DATETIME

### Step 2: Update Backend Code

Deploy backend changes:

```bash
# From local machine
cd /Users/mmurphy/strom-scout

# Rsync backend files
rsync -avz -e "ssh -p REDACTED_PORT" backend/ stormscout:~/backend/ \
  --exclude 'node_modules' \
  --exclude '.env' \
  --exclude '*.log'
```

**Files updated:**
- `backend/src/app.js` - Added trends route
- `backend/src/models/advisoryHistory.js` - New model
- `backend/src/models/site.js` - Added getByIds method
- `backend/src/routes/trends.js` - New route
- `backend/src/ingestion/noaa-ingestor.js` - Added snapshot creation

### Step 3: Restart Backend

```bash
# SSH into production
ssh -p REDACTED_PORT mmurphy@66.29.148.111

# Restart Node.js application
# If using PM2:
pm2 restart storm-scout

# If using systemd:
sudo systemctl restart storm-scout

# Verify restart
pm2 status
# or
sudo systemctl status storm-scout
```

### Step 4: Deploy Frontend

Deploy all frontend files including new Phase 3 features:

```bash
# From local machine
cd /Users/mmurphy/strom-scout

# Deploy frontend
rsync -avz -e "ssh -p REDACTED_PORT" frontend/ stormscout:~/public_html/
```

**New Files:**
- `frontend/map.html` - Map visualization page
- `frontend/manifest.json` - PWA manifest
- `frontend/sw.js` - Service worker
- `frontend/js/trends.js` - Trend analysis component
- `frontend/js/export.js` - Export system
- `frontend/js/pwa.js` - PWA registration

**Updated Files:**
- `frontend/index.html` - Added map nav link
- `frontend/advisories.html` - Added map nav link
- `frontend/sites.html` - Added map nav link
- `frontend/site-detail.html` - Added map nav link
- `frontend/js/api.js` - Added trends API methods

### Step 5: Verify Deployment

#### Test Map View
1. Navigate to https://your-domain.example.com/map.html
2. Verify markers appear on map
3. Click markers to verify popups
4. Test severity filters
5. Test "Fit All Sites" button

#### Test Trends (After First Ingestion)
1. Wait for next ingestion cycle
2. Navigate to https://your-domain.example.com/api/trends
3. Verify JSON response with trend data
4. Check site detail pages for trend sections

#### Test Export System
1. Go to any page with site/advisory data
2. Test CSV export
3. Test Incident Report generation
4. Test Site Summary generation
5. Test Executive Briefing generation

#### Test PWA Features
1. Visit site on mobile device
2. Look for "Install App" prompt
3. Install and verify standalone mode
4. Test offline functionality (airplane mode)
5. Verify cached pages load offline

### Step 6: Run First Ingestion

Trigger ingestion to create first historical snapshots:

```bash
# SSH into production
ssh -p REDACTED_PORT mmurphy@66.29.148.111

# Navigate to backend
cd ~/backend

# Run ingestion manually to test
node src/ingestion/noaa-ingestor.js
```

**Expected output:**
- Standard ingestion messages
- New line: "Creating historical snapshots..."
- "Created X historical snapshots"

**Verify snapshots:**
```sql
mysql -h localhost -u teamma16_storm -p teamma16_storm_scout \
  -e "SELECT COUNT(*) as snapshot_count FROM advisory_history;"
```

---

## API Endpoints

### New Endpoints

**GET /api/trends**
- Returns trends for all sites with history
- Query params: `?days=7` (default 7)
- Response: Array of trend objects with site info

**GET /api/trends/:siteId**
- Returns trend data for specific site
- Query params: `?days=7`
- Response: Trend object with history array

**GET /api/trends/:siteId/history**
- Returns full historical snapshots for site
- Query params: `?days=7`
- Response: Site object + history array

---

## Configuration

### PWA Configuration

Edit `frontend/manifest.json` to customize:
- `name` / `short_name` - App name
- `theme_color` - App theme color
- `background_color` - Splash screen color
- `icons` - App icons (need to create)

### Service Worker Cache

Edit `frontend/sw.js` to customize:
- `CACHE_NAME` - Update version to force cache refresh
- `PRECACHE_ASSETS` - Files to cache immediately
- Cache strategies (network-first vs cache-first)

---

## Monitoring

### Check Historical Data Collection

```sql
-- Count snapshots per site
SELECT s.site_code, s.name, COUNT(h.id) as snapshot_count
FROM sites s
LEFT JOIN advisory_history h ON s.id = h.site_id
GROUP BY s.id
ORDER BY snapshot_count DESC
LIMIT 10;

-- Recent snapshots
SELECT s.site_code, h.snapshot_time, h.advisory_count, h.highest_severity
FROM advisory_history h
JOIN sites s ON h.site_id = s.id
ORDER BY h.snapshot_time DESC
LIMIT 20;

-- Trend data availability
SELECT 
  DATE(snapshot_time) as date,
  COUNT(DISTINCT site_id) as sites_tracked
FROM advisory_history
GROUP BY DATE(snapshot_time)
ORDER BY date DESC;
```

### Clean Up Old History

The `advisoryHistory.js` model includes a cleanup method:

```javascript
// In backend code or admin script
const AdvisoryHistory = require('./models/advisoryHistory');

// Keep last 30 days, delete older
await AdvisoryHistory.cleanupOldHistory(30);
```

---

## Mobile Testing

### iOS Testing
1. Open Safari on iPhone/iPad
2. Navigate to https://your-domain.example.com
3. Tap Share button → "Add to Home Screen"
4. Open app from home screen
5. Verify standalone mode (no Safari UI)

### Android Testing
1. Open Chrome on Android device
2. Navigate to https://your-domain.example.com
3. Tap menu → "Install app" or "Add to Home screen"
4. Open app from app drawer
5. Verify standalone mode

### Offline Testing
1. Install app on device
2. Open app and navigate to a few pages
3. Enable airplane mode
4. Navigate back to previously viewed pages
5. Verify cached content loads
6. Verify offline page appears for new pages

---

## Troubleshooting

### Map Not Loading
- Check browser console for errors
- Verify Leaflet.js CDN is accessible
- Check that sites have latitude/longitude data
- Verify API endpoints are responding

### Trends Showing "No Data"
- Ensure ingestion has run at least twice
- Check `advisory_history` table has data
- Verify trend API endpoint is accessible
- Check browser console for errors

### PWA Not Installing
- Verify site is served over HTTPS
- Check `manifest.json` is accessible
- Verify service worker registers successfully
- Check browser console for PWA errors

### Exports Not Working
- Check browser console for JavaScript errors
- Verify data is being passed to export functions
- Test with smaller datasets first
- Check popup blocker settings

---

## Rollback Plan

If issues occur, rollback steps:

1. **Frontend Rollback:**
```bash
# Restore previous frontend
git checkout HEAD~1 frontend/
rsync -avz -e "ssh -p REDACTED_PORT" frontend/ stormscout:~/public_html/
```

2. **Backend Rollback:**
```bash
# Restore previous backend
git checkout HEAD~1 backend/
rsync -avz -e "ssh -p REDACTED_PORT" backend/ stormscout:~/backend/ --exclude node_modules
ssh -p REDACTED_PORT stormscout "pm2 restart storm-scout"
```

3. **Database Rollback (if needed):**
```sql
-- advisory_history table can be left in place or dropped
DROP TABLE IF EXISTS advisory_history;
```

---

## Post-Deployment Tasks

1. **Monitor first ingestion cycle:**
   - Check logs for snapshot creation
   - Verify no errors in ingestion process

2. **Wait 24 hours for historical data:**
   - Multiple ingestion cycles needed for trends
   - Check trend API after 24h

3. **Create PWA icons:**
   - Generate 192x192 and 512x512 PNG icons
   - Place in `frontend/icons/` directory
   - Update manifest.json paths if needed

4. **Test on multiple devices:**
   - Desktop browsers (Chrome, Firefox, Safari, Edge)
   - Mobile devices (iOS Safari, Android Chrome)
   - Tablet devices

5. **Document user guidance:**
   - Create quick start guide for map view
   - Document export options for users
   - Create PWA installation guide

---

## Phase 3 Metrics

Track these metrics after deployment:

- Map page views
- PWA installation rate
- Export usage (CSV vs reports)
- Trend API calls
- Historical data growth rate
- Offline mode usage
- Mobile vs desktop usage

---

## Next Steps (Phase 4 Considerations)

Potential Phase 4 enhancements based on Phase 3:

1. **Enhanced Charting:** Replace custom charts with Chart.js for richer visualizations
2. **Advanced Filters:** Add date range filters for historical data
3. **Alerts & Notifications:** Push notifications for severe weather
4. **Forecast Integration:** Add weather forecast data
5. **User Preferences:** Save export templates, view preferences
6. **Real-time Updates:** WebSocket support for live updates

---

**Deployment Status:** ✅ Ready for Production  
**Estimated Deployment Time:** 30 minutes  
**Required Downtime:** None (hot deployment)
