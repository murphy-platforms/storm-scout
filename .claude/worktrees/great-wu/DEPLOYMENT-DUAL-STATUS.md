# Dual Status System Deployment Guide

## Overview
This guide walks through deploying the dual status system that separates automatic weather impact assessment from manual operational status decisions.

**Co-Authored-By:** Warp <agent@warp.dev>

## What's Changing

### Before (Single Status):
- One field: `operational_status` (Open, At Risk, Closed)
- Automatically set by weather data
- No manual override capability

### After (Dual Status):
- **Weather Impact** (automatic): 🔴 RED, 🟠 ORANGE, 🟡 YELLOW, 🟢 GREEN
- **Operational Status** (manual): ❌ CLOSED, ⚠️ RESTRICTED, ✅ OPEN, 🔄 PENDING
- Full audit trail of decisions

## Deployment Steps

### Phase 1: Pre-Deployment Preparation

#### 1.1 Backup Production Database
```bash
# SSH into production server
ssh stormscout -p 21098

# Create backup directory
mkdir -p ~/backups

# Backup database
mysqldump --defaults-extra-file=<(echo -e "[client]\nuser=mwqtiakilx_stormuser\npassword=7GEq^LiZiK=Z\nhost=localhost") \
  ***REDACTED*** > ~/backups/stormscout_pre_dual_status_$(date +%Y%m%d_%H%M%S).sql

# Verify backup was created
ls -lh ~/backups/
```

#### 1.2 Review Current State
```bash
# Check current site_status schema
mysql --defaults-extra-file=<(echo -e "[client]\nuser=mwqtiakilx_stormuser\npassword=7GEq^LiZiK=Z\nhost=localhost") \
  ***REDACTED*** -e "DESCRIBE site_status;"

# Check current operational status distribution
mysql --defaults-extra-file=<(echo -e "[client]\nuser=mwqtiakilx_stormuser\npassword=7GEq^LiZiK=Z\nhost=localhost") \
  ***REDACTED*** -e "SELECT operational_status, COUNT(*) FROM site_status GROUP BY operational_status;"
```

### Phase 2: Deploy Code

#### 2.1 Deploy Backend Changes
```bash
# On local machine, push to git
cd ~/strom-scout
git push origin main

# On production server
cd ~/storm-scout
git pull origin main

# Verify new files exist
ls -la backend/src/data/migrations/add-dual-status.sql
ls -la backend/src/routes/operational-status.js
```

#### 2.2 Restart Backend Service
```bash
# Stop current backend
pkill -f "node.*server.js"

# Start backend (adjust path as needed)
cd ~/storm-scout/backend
nohup node src/server.js > ~/logs/storm-scout-backend.log 2>&1 &

# Verify it's running
ps aux | grep "node.*server.js"

# Check logs for any errors
tail -n 50 ~/logs/storm-scout-backend.log
```

#### 2.3 Deploy Frontend Changes
```bash
# Copy frontend files to public_html
cp -r ~/storm-scout/frontend/* ~/public_html/

# Verify new CSS styles were copied
ls -la ~/public_html/css/style.css

# Verify dashboard was updated
grep "Weather Impact Assessment" ~/public_html/index.html
```

### Phase 3: Database Migration

#### 3.1 Run Migration Script
```bash
# Execute the migration
mysql --defaults-extra-file=<(echo -e "[client]\nuser=mwqtiakilx_stormuser\npassword=7GEq^LiZiK=Z\nhost=localhost") \
  ***REDACTED*** < ~/storm-scout/backend/src/data/migrations/add-dual-status.sql
```

**Expected Output:**
```
Migration completed. Verification results:
weather_impact_level | count
green                | 219  (all sites start as green)

operational_status | count
open_normal        | 219  (migrated from old 'Open' status)

sites_with_decisions
219
```

#### 3.2 Verify Schema Changes
```bash
mysql --defaults-extra-file=<(echo -e "[client]\nuser=mwqtiakilx_stormuser\npassword=7GEq^LiZiK=Z\nhost=localhost") \
  ***REDACTED*** -e "DESCRIBE site_status;"
```

**Expected New Fields:**
- `weather_impact_level` VARCHAR(10) NOT NULL DEFAULT 'green'
- `decision_by` VARCHAR(255) NULL
- `decision_at` DATETIME NULL
- `decision_reason` TEXT NULL

#### 3.3 Verify Data Migration
```bash
# Check weather impact distribution
mysql --defaults-extra-file=<(echo -e "[client]\nuser=mwqtiakilx_stormuser\npassword=7GEq^LiZiK=Z\nhost=localhost") \
  ***REDACTED*** -e "
    SELECT weather_impact_level, COUNT(*) as count 
    FROM site_status 
    GROUP BY weather_impact_level 
    ORDER BY CASE weather_impact_level 
      WHEN 'red' THEN 1 
      WHEN 'orange' THEN 2 
      WHEN 'yellow' THEN 3 
      WHEN 'green' THEN 4 
    END;"

# Check operational status distribution
mysql --defaults-extra-file=<(echo -e "[client]\nuser=mwqtiakilx_stormuser\npassword=7GEq^LiZiK=Z\nhost=localhost") \
  ***REDACTED*** -e "
    SELECT operational_status, COUNT(*) as count 
    FROM site_status 
    GROUP BY operational_status;"

# Verify all sites have decision tracking
mysql --defaults-extra-file=<(echo -e "[client]\nuser=mwqtiakilx_stormuser\npassword=7GEq^LiZiK=Z\nhost=localhost") \
  ***REDACTED*** -e "
    SELECT COUNT(*) as total_sites, 
           COUNT(decision_by) as sites_with_decision 
    FROM site_status;"
```

### Phase 4: Verification

#### 4.1 Test API Endpoints
```bash
# Test overview endpoint (should return weather_impact_counts and operational_status_counts)
curl -s https://your-domain.example.com/api/status/overview | jq '.data | {weather_impact_counts, operational_status_counts}'

# Test new operational status endpoint
curl -s https://your-domain.example.com/api/operational-status/summary | jq '.data.summary'

# Test sites that need attention
curl -s https://your-domain.example.com/api/operational-status/summary | jq '.data.needs_attention'
```

#### 4.2 Test Dashboard UI
1. Open https://your-domain.example.com in browser
2. Verify you see two separate sections:
   - **Weather Impact Assessment (Automatic)** with 🔴🟠🟡🟢 cards
   - **Operational Status (IMT/Operations Decision)** with ❌⚠️🔄✅ cards
3. Check "Status Management" link appears in navigation
4. Verify counts are loading correctly

#### 4.3 Test Ingestion Cycle
```bash
# Manually trigger ingestion
cd ~/storm-scout/backend
node src/ingestion/noaa-ingestor.js

# Check logs for weather impact calculation
tail -n 100 ~/logs/storm-scout-backend.log | grep -i "weather"

# Verify weather impact levels were updated
mysql --defaults-extra-file=<(echo -e "[client]\nuser=mwqtiakilx_stormuser\npassword=7GEq^LiZiK=Z\nhost=localhost") \
  ***REDACTED*** -e "
    SELECT s.site_code, ss.weather_impact_level, ss.operational_status, 
           COUNT(a.id) as advisory_count
    FROM site_status ss
    JOIN sites s ON ss.site_id = s.id
    LEFT JOIN advisories a ON a.site_id = s.id AND a.status = 'active'
    WHERE ss.weather_impact_level IN ('red', 'orange')
    GROUP BY s.id
    LIMIT 10;"
```

### Phase 5: Remaining Frontend Work (Optional - Complete Later)

The following pages still need to be updated to show dual status:

#### 5.1 Sites Page (sites.html)
**TODO:** Update to display both weather impact and operational status badges

#### 5.2 Advisories Page (advisories.html)
**TODO:** Add weather impact level column to advisory table

#### 5.3 Status Management Page (status-management.html)
**TODO:** Create new page for IMT/Ops to manually set operational status

These can be completed in a follow-up deployment without affecting current functionality.

## Rollback Plan

If something goes wrong, you can rollback:

### Option 1: Restore Database Backup
```bash
# Stop backend
pkill -f "node.*server.js"

# Restore backup
mysql --defaults-extra-file=<(echo -e "[client]\nuser=mwqtiakilx_stormuser\npassword=7GEq^LiZiK=Z\nhost=localhost") \
  ***REDACTED*** < ~/backups/stormscout_pre_dual_status_YYYYMMDD_HHMMSS.sql

# Revert code
cd ~/storm-scout
git reset --hard HEAD~2  # Go back 2 commits (before dual status)

# Restart backend
cd ~/storm-scout/backend
nohup node src/server.js > ~/logs/storm-scout-backend.log 2>&1 &
```

### Option 2: Manual Database Rollback
```bash
# Remove new columns
mysql --defaults-extra-file=<(echo -e "[client]\nuser=mwqtiakilx_stormuser\npassword=7GEq^LiZiK=Z\nhost=localhost") \
  ***REDACTED*** -e "
    ALTER TABLE site_status DROP COLUMN weather_impact_level;
    ALTER TABLE site_status DROP COLUMN decision_by;
    ALTER TABLE site_status DROP COLUMN decision_at;
    ALTER TABLE site_status DROP COLUMN decision_reason;
    
    -- Revert operational_status values
    UPDATE site_status SET operational_status = 
      CASE operational_status
        WHEN 'open_normal' THEN 'Open'
        WHEN 'pending' THEN 'At Risk'
        WHEN 'closed' THEN 'Closed'
        WHEN 'open_restricted' THEN 'At Risk'
      END;"
```

## Testing the New Operational Status Management

### Set a Site to Closed
```bash
curl -X POST https://your-domain.example.com/api/operational-status/sites/1 \
  -H "Content-Type: application/json" \
  -d '{
    "operational_status": "closed",
    "decision_by": "John Smith (IMT)",
    "decision_reason": "Blizzard conditions - unsafe for staff and candidates"
  }'
```

### Bulk Update Multiple Sites
```bash
curl -X POST https://your-domain.example.com/api/operational-status/bulk-update \
  -H "Content-Type: application/json" \
  -d '{
    "site_ids": [1, 2, 3, 4, 5],
    "operational_status": "open_restricted",
    "decision_by": "Operations Team",
    "decision_reason": "Limited staff due to weather - reduced capacity"
  }'
```

### Query Site Status
```bash
# Get specific site status
curl -s https://your-domain.example.com/api/operational-status/sites/1 | jq

# Check which sites need decisions
curl -s https://your-domain.example.com/api/operational-status/summary | jq '.data.needs_attention'
```

## Success Criteria

✅ **Phase 1 Complete When:**
- Database backup created successfully
- Current schema documented

✅ **Phase 2 Complete When:**
- Code deployed to production
- Backend service restarted without errors
- Frontend files copied to public_html

✅ **Phase 3 Complete When:**
- Migration executed successfully
- All 219 sites have `weather_impact_level` field
- All 219 sites have `decision_by = 'system_migration'`
- Operational status values updated to new format

✅ **Phase 4 Complete When:**
- API returns both `weather_impact_counts` and `operational_status_counts`
- Dashboard shows two separate status sections
- Ingestion updates weather impact without changing operational status
- Manual status changes work via API

## Support & Troubleshooting

### Common Issues

**Issue: Backend won't start after deployment**
```bash
# Check logs for errors
tail -100 ~/logs/storm-scout-backend.log

# Common causes:
# - Syntax error in new code
# - Missing node module
# - Database connection issue

# Solution: Check error message and fix accordingly
```

**Issue: Migration fails**
```bash
# Check which step failed
# If column already exists: Skip that ALTER TABLE command
# If data migration fails: Check for NULL values or data integrity issues
```

**Issue: Dashboard shows spinner/loading forever**
```bash
# Check browser console for errors
# Verify API endpoint is returning data:
curl -s https://your-domain.example.com/api/status/overview | jq '.success'

# If false, check backend logs
```

**Issue: Weather impact not updating**
```bash
# Check ingestion is running
ps aux | grep ingest

# Manually trigger
cd ~/storm-scout/backend
node src/ingestion/noaa-ingestor.js

# Check for errors in output
```

## Next Steps After Deployment

1. **Monitor** ingestion cycles for 24 hours to ensure weather impacts update correctly
2. **Train** IMT/Operations team on new Status Management page (when ready)
3. **Document** operational procedures for setting site status
4. **Complete** remaining frontend pages (sites.html, advisories.html, status-management.html)
5. **Create** dashboard views/reports for IMT decision-making

## Contact

If you encounter issues during deployment, check:
1. Backend logs: `~/logs/storm-scout-backend.log`
2. Database queries in this guide
3. Git commit history: `git log --oneline`
