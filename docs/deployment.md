# Storm Scout Deployment Guide

This document outlines current deployment procedures and best practices.

> For a quick-start guide see `DEPLOY.md` in the project root.

## Environment

- **Platform**: Ubuntu Linux, systemd user service
- **Database**: MariaDB 11 via Docker (`storm-scout-db` container)
- **Node.js**: 18+ LTS
- **Backend Path**: `$APP_ROOT/backend/`
- **Frontend**: Served as static files by Express (same process)

## SSH Configuration

Configure an SSH alias for easier remote access:

```
Host your-server-alias
    HostName <server-ip>
    Port 22
    User your-ssh-user
    IdentityFile ~/.ssh/id_ed25519
```

This allows simplified commands:
- `ssh $DEPLOY_USER@$DEPLOY_HOST` instead of `ssh user@<ip>`
- `rsync` and `scp` commands use the alias automatically

## Deployment Procedures

### Service Management

The backend runs as a systemd user service. Key commands:

```bash
# Check status
systemctl --user status storm-scout-dev

# Restart after code changes
systemctl --user restart storm-scout-dev

# View live logs
journalctl --user -u storm-scout-dev -f
```

### Frontend Deployment

The frontend is served as static files by Express from `frontend/`. Deploy with rsync:

```bash
rsync -avz frontend/ $DEPLOY_USER@$DEPLOY_HOST:$APP_ROOT/frontend/
```

### Backend Deployment

```bash
# Deploy backend code (excludes node_modules, .env, tmp)
rsync -avz \
  --exclude='node_modules' \
  --exclude='.env' \
  --exclude='*.log' \
  --exclude='tmp/' \
  backend/ $DEPLOY_USER@$DEPLOY_HOST:$APP_ROOT/backend/

# Install/update dependencies on server
ssh $DEPLOY_USER@$DEPLOY_HOST "cd $APP_ROOT/backend && npm ci --production"

# Restart application
ssh $DEPLOY_USER@$DEPLOY_HOST "systemctl --user restart storm-scout-dev"
```

**Important Notes**:
- Never deploy `.env` files — configure environment variables directly on the server
- Always run `npm ci --production` after deploying if `package.json` changed
- Exclude `tmp/` from rsync to avoid interfering with any runtime state

### Database Migrations

#### SQL Migration Files

```bash
# Copy migration SQL to server
scp -P $DEPLOY_PORT backend/migrations/YYYYMMDD-description.sql $DEPLOY_USER@$DEPLOY_HOST:~/storm-scout/migrations/

# Execute on server
ssh $DEPLOY_USER@$DEPLOY_HOST
mysql -u $DB_USER -p $DB_NAME < ~/storm-scout/migrations/YYYYMMDD-description.sql
exit
```

#### Node.js Migration Scripts

```bash
# Copy migration script
scp -P $DEPLOY_PORT backend/scripts/migrate-vtec.js $DEPLOY_USER@$DEPLOY_HOST:~/storm-scout/scripts/

# Execute via SSH
ssh $DEPLOY_USER@$DEPLOY_HOST "cd ~/storm-scout && node scripts/migrate-vtec.js"
```

**Migration Best Practices**:
1. Always backup database before running migrations
2. Test migrations on local development database first
3. Name migrations with date prefix: `YYYYMMDD-description.sql`
4. Document migration in git commit message
5. Keep migrations idempotent when possible (safe to re-run)

### Restart Application

```bash
# Restart the systemd service
systemctl --user restart storm-scout-dev

# Check it came back up cleanly
systemctl --user status storm-scout-dev
journalctl --user -u storm-scout-dev -n 20
```

## Typical Deployment Workflows

### Simple Frontend Update

```bash
# Example: Update advisories page
scp -P $DEPLOY_PORT frontend/advisories.html $DEPLOY_USER@$DEPLOY_HOST:~/public_html/advisories.html

# Hard refresh browser to see changes (Cmd+Shift+R on Mac)
```

### Backend Code Update

```bash
# 1. Deploy code
rsync -avz -e "ssh -p $DEPLOY_PORT" --exclude='node_modules' --exclude='.env' backend/ $DEPLOY_USER@$DEPLOY_HOST:~/storm-scout/

# 2. Install dependencies (if package.json changed)
ssh $DEPLOY_USER@$DEPLOY_HOST "cd ~/storm-scout && npm ci --production"

# 3. Restart app
ssh $DEPLOY_USER@$DEPLOY_HOST "touch ~/storm-scout/tmp/restart.txt"

# 4. Monitor logs for startup
ssh $DEPLOY_USER@$DEPLOY_HOST "tail -f ~/storm-scout/logs/app.log"
```

### Database Schema Change

```bash
# 1. Backup database first!
ssh $DEPLOY_USER@$DEPLOY_HOST "mysqldump -u \$DB_USER -p \$DB_NAME > ~/backups/pre-migration-$(date +%Y%m%d_%H%M%S).sql"

# 2. Deploy migration script
scp -P $DEPLOY_PORT backend/scripts/add-vtec-columns.js $DEPLOY_USER@$DEPLOY_HOST:~/storm-scout/scripts/

# 3. Run migration
ssh $DEPLOY_USER@$DEPLOY_HOST "cd ~/storm-scout && node scripts/add-vtec-columns.js"

# 4. Deploy updated backend code (if models changed)
rsync -avz -e "ssh -p $DEPLOY_PORT" --exclude='node_modules' --exclude='.env' backend/ $DEPLOY_USER@$DEPLOY_HOST:~/storm-scout/

# 5. Restart
ssh $DEPLOY_USER@$DEPLOY_HOST "touch ~/storm-scout/tmp/restart.txt"
```

## Pre-Deployment Checklist

### Every Deployment

- [ ] Test changes locally first
- [ ] Verify no secrets in code (check git diff)
- [ ] Commit changes with descriptive message
- [ ] Review files being deployed

### Frontend Deployments

- [ ] Test in browser locally with backend API
- [ ] Check browser console for JavaScript errors
- [ ] Verify responsive design on mobile
- [ ] Note which files changed

### Backend Deployments

- [ ] Run backend locally: `npm start`
- [ ] Test API endpoints with curl or Postman
- [ ] Check for database schema changes
- [ ] Review environment variable requirements
- [ ] Plan for zero-downtime if possible

### Database Migrations

- [ ] **CRITICAL**: Backup database first
- [ ] Test migration on local development DB
- [ ] Document rollback procedure
- [ ] Consider data volume (large tables may take time)
- [ ] Schedule during low-traffic period if breaking change

## Post-Deployment Verification

### Frontend Verification

```bash
# 1. Hard refresh browser (bypass cache)
#    Mac: Cmd+Shift+R
#    Windows: Ctrl+F5

# 2. Check browser console (F12 > Console)
#    Look for JavaScript errors

# 3. Test all pages
#    - index.html
#    - advisories.html
#    - offices.html
#    - office-detail.html
#    - notices.html
#    - filters.html
#    - sources.html

# 4. Verify mobile responsiveness
```

### Backend Verification

```bash
# 1. Check service is running
systemctl --user status storm-scout-dev

# 2. Test health endpoint
curl http://localhost:3000/health

# 3. Test specific API endpoints
curl http://localhost:3000/api/advisories/active | jq .
curl http://localhost:3000/api/offices | jq .

# 4. Check logs for errors
journalctl --user -u storm-scout-dev -n 100 | grep -i error

# 5. Monitor live
journalctl --user -u storm-scout-dev -f
```

### Database Verification

```bash
# Connect to database (via Docker)
docker exec -it storm-scout-db mariadb -u storm_scout -plocaldev storm_scout_dev

# Verify schema
DESCRIBE advisories;
SHOW INDEXES FROM advisories;

# Check data integrity
SELECT COUNT(*) FROM advisories;
SELECT COUNT(*) FROM offices;

# Verify recent updates
SELECT * FROM advisories ORDER BY last_updated DESC LIMIT 5;
```

## Environment Configuration

### Server Environment Variables

Edit on server (never deploy .env from local):

```bash
ssh $DEPLOY_USER@$DEPLOY_HOST "nano ~/storm-scout/.env"
```

**Required Variables**:

```bash
# Database Configuration
DB_HOST=localhost
DB_USER=storm_scout
DB_PASSWORD=<secure-password>
DB_NAME=storm_scout
DB_PORT=3306

# API Server
PORT=3000
NODE_ENV=production

# NOAA Weather API
NOAA_API_BASE_URL=https://api.weather.gov
NOAA_API_USER_AGENT=(Storm Scout, your-email@domain.com)

# Data Ingestion
INGESTION_ENABLED=true
INGESTION_INTERVAL_MINUTES=15

# Logging
LOG_LEVEL=info
```

## Monitoring & Troubleshooting

### Check Application Status

```bash
# Service status
systemctl --user status storm-scout-dev

# Recent logs
journalctl --user -u storm-scout-dev -n 100

# Follow logs in real-time
journalctl --user -u storm-scout-dev -f
```

### Monitor Data Ingestion

```bash
# Check last update time via API
curl http://localhost:3000/health | jq '.checks.ingestion'

# Manually trigger ingestion
cd $APP_ROOT/backend && node src/ingestion/run-ingestion.js

# Check ingestion log entries
journalctl --user -u storm-scout-dev | grep -i ingest | tail -20
```

### Database Access

```bash
# Connect to MariaDB via Docker
docker exec -it storm-scout-db mariadb -u storm_scout -plocaldev storm_scout_dev

# Useful diagnostic queries
SELECT COUNT(*) FROM advisories;
SELECT COUNT(*) FROM offices;
SELECT COUNT(DISTINCT vtec_event_id) FROM advisories WHERE vtec_event_id IS NOT NULL;
SELECT * FROM advisories ORDER BY last_updated DESC LIMIT 10;
SELECT office_code, COUNT(*) as alert_count FROM advisories GROUP BY office_code ORDER BY alert_count DESC LIMIT 10;
```

### Common Issues

#### Application Won't Start

1. Check logs: `journalctl --user -u storm-scout-dev -n 100`
2. Verify Node.js version: `node --version` (should be 18+)
3. Check database connection in `.env`
4. Verify Docker container is running: `docker ps | grep storm-scout-db`
5. Reinstall dependencies: `cd $APP_ROOT/backend && rm -rf node_modules && npm ci --production`

#### Data Not Updating

1. Verify `INGESTION_ENABLED=true` in `.env`
2. Check service is running: `systemctl --user status storm-scout-dev`
3. Run manual ingestion: `cd backend && node src/ingestion/run-ingestion.js`
4. Check NOAA API availability: `curl https://api.weather.gov/alerts/active`
5. Review ingestion logs: `journalctl --user -u storm-scout-dev | grep -i ingest`

#### Alerts Showing as Active After Expiration

If alerts remain `active` after their `end_time` has passed:

```bash
# Check for stale alerts
ssh $DEPLOY_USER@$DEPLOY_HOST "cd ~/storm-scout && node -e \"
require('dotenv').config();
const {initDatabase, getDatabase} = require('./src/config/database.js');
initDatabase().then(() => getDatabase().query('SELECT COUNT(*) as stale FROM advisories WHERE status=\\\"active\\\" AND end_time < NOW()')).then(([r]) => console.log('Stale alerts:', r[0].stale));
\""

# Run the expiration fix manually
ssh $DEPLOY_USER@$DEPLOY_HOST "cd ~/storm-scout && node -e \"
require('dotenv').config();
const {initDatabase} = require('./src/config/database.js');
const {markExpiredByEndTime} = require('./src/utils/cleanup-advisories.js');
initDatabase().then(() => markExpiredByEndTime()).then(n => {console.log('Fixed:', n); process.exit(0);});
\""
```

As of v1.2.1, alerts are automatically marked as expired when `end_time < NOW()` during both ingestion and cleanup.

#### Frontend Not Updating

1. Hard refresh browser (clear cache)
2. Check browser console for errors
3. Verify file was deployed: `ssh $DEPLOY_USER@$DEPLOY_HOST "ls -lh ~/public_html/advisories.html"`
4. Check file modification time: `ssh $DEPLOY_USER@$DEPLOY_HOST "stat ~/public_html/advisories.html"`
5. Clear CDN cache if using CloudFlare or similar

#### Database Connection Errors

1. Verify Docker container is running: `docker ps | grep storm-scout-db`
2. Start if stopped: `docker start storm-scout-db`
3. Check credentials in `.env`
4. Test connection: `docker exec -it storm-scout-db mariadb -u storm_scout -p`
5. Check database exists: `SHOW DATABASES;`

## Rollback Procedures

### Frontend Rollback

```bash
# Find previous working version
git log --oneline frontend/

# Checkout specific file from previous commit
git checkout <commit-hash> -- frontend/advisories.html

# Deploy old version
scp -P $DEPLOY_PORT frontend/advisories.html $DEPLOY_USER@$DEPLOY_HOST:~/public_html/

# Restore to HEAD
git checkout HEAD -- frontend/advisories.html
```

### Backend Rollback

```bash
# Find last known good commit
git log --oneline backend/

# Create rollback branch
git checkout -b rollback-<issue> <commit-hash>

# Deploy rolled-back version
rsync -avz -e "ssh -p $DEPLOY_PORT" --exclude='node_modules' --exclude='.env' backend/ $DEPLOY_USER@$DEPLOY_HOST:~/storm-scout/

# Restart
ssh $DEPLOY_USER@$DEPLOY_HOST "touch ~/storm-scout/tmp/restart.txt"

# If successful, can merge rollback to main
# If not, can checkout main again
```

### Database Rollback

**Critical**: Always backup before migrations!

```bash
# Create backup before migration
ssh $DEPLOY_USER@$DEPLOY_HOST "mysqldump -u \$DB_USER -p \$DB_NAME > ~/backups/db_backup_$(date +%Y%m%d_%H%M%S).sql"

# If rollback needed, restore from backup
ssh $DEPLOY_USER@$DEPLOY_HOST "mysql -u \$DB_USER -p \$DB_NAME < ~/backups/db_backup_YYYYMMDD_HHMMSS.sql"

# Restart application after restore
ssh $DEPLOY_USER@$DEPLOY_HOST "touch ~/storm-scout/tmp/restart.txt"
```

## Backup Strategy

### Automated Daily Backups

Set up a cron job on the server:

```bash
crontab -e

# Add this line (runs at 2 AM daily, keeps 30 days)
0 2 * * * docker exec storm-scout-db mariadb-dump -u storm_scout -p'PASSWORD' storm_scout_dev | gzip > ~/backups/storm_scout_$(date +\%Y\%m\%d).sql.gz && find ~/backups -name "storm_scout_*.sql.gz" -mtime +30 -delete
```

### Manual Backup

```bash
# Backup database via Docker
mkdir -p ~/backups
docker exec storm-scout-db mariadb-dump -u storm_scout -plocaldev storm_scout_dev \
  | gzip > ~/backups/manual_$(date +%Y%m%d_%H%M%S).sql.gz

# Download backup locally
scp $DEPLOY_USER@$DEPLOY_HOST:~/backups/manual_*.sql.gz ~/local-backups/
```

### Restore from Backup

```bash
# Restore via Docker
gunzip < ~/backups/storm_scout_20260308.sql.gz \
  | docker exec -i storm-scout-db mariadb -u storm_scout -plocaldev storm_scout_dev

systemctl --user restart storm-scout-dev
```

## Security Best Practices

1. **Never commit secrets**: Keep `.env`, passwords, API keys out of git
2. **Use SSH keys**: Disable password authentication where possible
3. **Restrict SSH access**: Use firewall rules (allow only your IP if possible)
4. **Keep software updated**: Regularly update Node.js, npm packages, MySQL
5. **Strong passwords**: Use complex passwords for database and SSH
6. **HTTPS only**: All production traffic uses HTTPS (handled by server)
7. **API rate limiting**: Respect NOAA API limits (included in user agent)
8. **File permissions**: Ensure `.env` and database files are not world-readable
9. **Regular backups**: Automated daily backups with 30-day retention
10. **Monitor logs**: Regularly review logs for suspicious activity

## Performance Optimization

### Database Indexes

Current indexes for performance:

```sql
-- Unique constraint on VTEC event ID for deduplication
ALTER TABLE advisories ADD UNIQUE INDEX vtec_event_unique_key (vtec_event_id);

-- Index for office queries
ALTER TABLE advisories ADD INDEX idx_office_id (office_id);

-- Index for date-based cleanup
ALTER TABLE advisories ADD INDEX idx_expires (expires);
```

### Query the API Efficiently

**Best Practice**: Use the API endpoints rather than direct database queries in application code.

```javascript
// Good: Use API endpoints
const overview = await API.getOverview();
const advisories = await API.getActiveAdvisories();

// Avoid: Direct database queries in frontend
// Frontend should always go through the API layer
```

**Why**:
1. **Separation of concerns**: Database logic stays in backend
2. **Caching**: API can implement caching strategies
3. **Security**: No database credentials in frontend
4. **Consistency**: Single source of truth for data access
5. **Evolution**: Can change database without breaking frontend

## CI/CD Considerations

GitHub Actions CI runs automatically on every pull request: lint (ESLint + Prettier), test (Jest with coverage thresholds), E2E (Playwright), and CodeQL security analysis. All checks must pass before merge. Deployment to production is initiated manually via `deploy.sh`.

### v2.1.x Migrations

- `20260328-add-ingestion-timeout-status.sql` — Adds `'timeout'` to `ingestion_events.status` ENUM
- `20260328-add-station-name.sql` — Adds `station_name VARCHAR(100)` to `offices` table

## Documentation References

- [Backend API Documentation](./api.md)
- [Frontend Guide](./FRONTEND-GUIDE.md)
- [Data Dictionary](./DATA-DICTIONARY.md)
- [VTEC Implementation](./vtec-implementation.md)

---

**Last Updated**: March 28, 2026
**Maintained By**: Storm Scout Team
