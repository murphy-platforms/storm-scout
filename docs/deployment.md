# Storm Scout Deployment Guide

This document outlines the current production deployment procedures and best practices.

## Production Environment

- **URL**: https://your-domain.example.com
- **Server**: 66.29.148.111:REDACTED_PORT
- **SSH Alias**: `stormscout`
- **Platform**: cPanel with Passenger (Node.js hosting)
- **Backend Path**: `~/storm-scout/`
- **Frontend Path**: `~/public_html/`
- **Node.js Version**: 20.x LTS
- **Database**: MySQL/MariaDB

## SSH Configuration

### Setup SSH Alias

Add to `~/.ssh/config`:

```
Host stormscout
    HostName 66.29.148.111
    Port REDACTED_PORT
    User <your-username>
    IdentityFile ~/.ssh/id_rsa
```

This allows simplified commands:
- `ssh stormscout` instead of `ssh -p REDACTED_PORT user@66.29.148.111`
- `scp` commands use the alias automatically

### Why SSH over FTP

**Always use SSH/SCP for deployments, never FTP:**

1. **Security**: SSH encrypts all data; FTP transmits credentials in plaintext
2. **Integrity**: SSH verifies file transfers with checksums
3. **Efficiency**: SCP supports compression during transfer
4. **Automation**: Scriptable deployments with error handling
5. **Permissions**: Preserves Unix file permissions and timestamps
6. **Modern**: Industry standard for server management

## Deployment Procedures

### Frontend Deployment

Deploy using SCP for individual files or groups:

```bash
# Deploy single HTML file
scp -P REDACTED_PORT frontend/index.html stormscout:~/public_html/index.html

# Deploy multiple HTML files
scp -P REDACTED_PORT frontend/*.html stormscout:~/public_html/

# Deploy JavaScript files
scp -P REDACTED_PORT frontend/js/*.js stormscout:~/public_html/js/

# Deploy specific JS component
scp -P REDACTED_PORT frontend/js/update-banner.js stormscout:~/public_html/js/

# Deploy CSS
scp -P REDACTED_PORT frontend/css/*.css stormscout:~/public_html/css/
```

**Best Practice**: Deploy only changed files to minimize transfer time and reduce deployment risk.

### Backend Deployment

Use rsync for backend to handle directory synchronization:

```bash
# Deploy backend code (excludes node_modules, .env, logs)
rsync -avz -e "ssh -p REDACTED_PORT" \
  --exclude='node_modules' \
  --exclude='.env' \
  --exclude='*.log' \
  --exclude='.git' \
  backend/ stormscout:~/storm-scout/

# Install/update production dependencies on server
ssh stormscout "cd ~/storm-scout && npm install --production"

# Restart application (Passenger)
ssh stormscout "touch ~/storm-scout/tmp/restart.txt"
```

**Important Notes**:
- Never deploy `.env` files - configure environment variables directly on server
- The `--exclude` flags prevent deploying unnecessary or sensitive files
- Always run `npm install --production` after deploying code changes
- Use `touch tmp/restart.txt` to trigger Passenger restart

### Database Migrations

#### SQL Migration Files

```bash
# Copy migration SQL to server
scp -P REDACTED_PORT backend/migrations/YYYYMMDD-description.sql stormscout:~/storm-scout/migrations/

# Execute on server
ssh stormscout
mysql -u storm_scout -p storm_scout < ~/storm-scout/migrations/YYYYMMDD-description.sql
exit
```

#### Node.js Migration Scripts

```bash
# Copy migration script
scp -P REDACTED_PORT backend/scripts/migrate-vtec.js stormscout:~/storm-scout/scripts/

# Execute via SSH
ssh stormscout "cd ~/storm-scout && node scripts/migrate-vtec.js"
```

**Migration Best Practices**:
1. Always backup database before running migrations
2. Test migrations on local development database first
3. Name migrations with date prefix: `YYYYMMDD-description.sql`
4. Document migration in git commit message
5. Keep migrations idempotent when possible (safe to re-run)

### Restart Application

Passenger uses a special restart mechanism:

```bash
# Standard restart
ssh stormscout "touch ~/storm-scout/tmp/restart.txt"

# Force create tmp directory and restart
ssh stormscout "mkdir -p ~/storm-scout/tmp && touch ~/storm-scout/tmp/restart.txt"
```

This triggers Passenger to reload the Node.js application without manual process management.

## Typical Deployment Workflows

### Simple Frontend Update

```bash
# Example: Update advisories page
scp -P REDACTED_PORT frontend/advisories.html stormscout:~/public_html/advisories.html

# Hard refresh browser to see changes (Cmd+Shift+R on Mac)
```

### Backend Code Update

```bash
# 1. Deploy code
rsync -avz -e "ssh -p REDACTED_PORT" --exclude='node_modules' --exclude='.env' backend/ stormscout:~/storm-scout/

# 2. Install dependencies (if package.json changed)
ssh stormscout "cd ~/storm-scout && npm install --production"

# 3. Restart app
ssh stormscout "touch ~/storm-scout/tmp/restart.txt"

# 4. Monitor logs for startup
ssh stormscout "tail -f ~/storm-scout/logs/app.log"
```

### Database Schema Change

```bash
# 1. Backup database first!
ssh stormscout "mysqldump -u storm_scout -p storm_scout > ~/backups/pre-migration-$(date +%Y%m%d_%H%M%S).sql"

# 2. Deploy migration script
scp -P REDACTED_PORT backend/scripts/add-vtec-columns.js stormscout:~/storm-scout/scripts/

# 3. Run migration
ssh stormscout "cd ~/storm-scout && node scripts/add-vtec-columns.js"

# 4. Deploy updated backend code (if models changed)
rsync -avz -e "ssh -p REDACTED_PORT" --exclude='node_modules' --exclude='.env' backend/ stormscout:~/storm-scout/

# 5. Restart
ssh stormscout "touch ~/storm-scout/tmp/restart.txt"
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
#    - sites.html
#    - notices.html
#    - filters.html
#    - sources.html

# 4. Verify mobile responsiveness
```

### Backend Verification

```bash
# 1. Check application is running
ssh stormscout "ps aux | grep node"

# 2. Test health endpoint
curl https://your-domain.example.com/api/status/overview

# 3. Test specific API endpoints
curl https://your-domain.example.com/api/advisories/active | jq .
curl https://your-domain.example.com/api/sites | jq .

# 4. Check logs for errors
ssh stormscout "tail -100 ~/storm-scout/logs/app.log | grep -i error"

# 5. Monitor for 5-10 minutes
ssh stormscout "tail -f ~/storm-scout/logs/app.log"
```

### Database Verification

```bash
# Connect to database
ssh stormscout
mysql -u storm_scout -p storm_scout

# Verify schema changes
DESCRIBE advisories;
SHOW INDEXES FROM advisories;

# Check data integrity
SELECT COUNT(*) FROM advisories;
SELECT COUNT(*) FROM sites;

# Verify recent updates
SELECT * FROM advisories ORDER BY last_updated DESC LIMIT 5;
```

## Environment Configuration

### Server Environment Variables

Edit on server (never deploy .env from local):

```bash
ssh stormscout "nano ~/storm-scout/.env"
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
# Verify Node.js process running
ssh stormscout "ps aux | grep node"

# View recent logs
ssh stormscout "tail -100 ~/storm-scout/logs/app.log"

# Follow logs in real-time
ssh stormscout "tail -f ~/storm-scout/logs/app.log"

# Check Passenger status (cPanel specific)
ssh stormscout "passenger-status"
```

### Monitor Data Ingestion

```bash
# Check last update time via API
curl https://your-domain.example.com/api/status/overview | jq '.last_updated'

# Manually trigger ingestion
ssh stormscout "cd ~/storm-scout && node src/ingestion/run-ingestion.js"

# Check ingestion logs
ssh stormscout "grep -i ingest ~/storm-scout/logs/app.log | tail -20"
```

### Database Access

```bash
# SSH into server
ssh stormscout

# Connect to MySQL
mysql -u storm_scout -p storm_scout

# Useful diagnostic queries
SELECT COUNT(*) FROM advisories;
SELECT COUNT(*) FROM sites;
SELECT COUNT(DISTINCT vtec_event_id) FROM advisories WHERE vtec_event_id IS NOT NULL;
SELECT * FROM advisories ORDER BY last_updated DESC LIMIT 10;
SELECT site_code, COUNT(*) as alert_count FROM advisories GROUP BY site_code ORDER BY alert_count DESC LIMIT 10;
```

### Common Issues

#### Application Won't Start

1. Check logs: `ssh stormscout "tail -100 ~/storm-scout/logs/error.log"`
2. Verify Node.js version: `ssh stormscout "node --version"` (should be 20.x)
3. Check database connection in `.env`
4. Verify file permissions: `ssh stormscout "ls -la ~/storm-scout"`
5. Reinstall dependencies: `ssh stormscout "cd ~/storm-scout && rm -rf node_modules && npm install --production"`

#### Data Not Updating

1. Verify ingestion is enabled in `.env`
2. Check cron jobs: `ssh stormscout "crontab -l"`
3. Run manual ingestion to test
4. Check NOAA API availability: `curl https://api.weather.gov/alerts/active`
5. Review ingestion logs for errors

#### Alerts Showing as Active After Expiration

If alerts remain `active` after their `end_time` has passed:

```bash
# Check for stale alerts
ssh stormscout "cd ~/storm-scout && node -e \"
require('dotenv').config();
const {initDatabase, getDatabase} = require('./src/config/database.js');
initDatabase().then(() => getDatabase().query('SELECT COUNT(*) as stale FROM advisories WHERE status=\\\"active\\\" AND end_time < NOW()')).then(([r]) => console.log('Stale alerts:', r[0].stale));
\""

# Run the expiration fix manually
ssh stormscout "cd ~/storm-scout && node -e \"
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
3. Verify file was deployed: `ssh stormscout "ls -lh ~/public_html/advisories.html"`
4. Check file modification time: `ssh stormscout "stat ~/public_html/advisories.html"`
5. Clear CDN cache if using CloudFlare or similar

#### Database Connection Errors

1. Verify MySQL is running: `ssh stormscout "systemctl status mysql"`
2. Check credentials in `.env`
3. Test connection: `ssh stormscout "mysql -u storm_scout -p"`
4. Check database exists: `SHOW DATABASES;`
5. Verify user permissions: `SHOW GRANTS FOR 'storm_scout'@'localhost';`

## Rollback Procedures

### Frontend Rollback

```bash
# Find previous working version
git log --oneline frontend/

# Checkout specific file from previous commit
git checkout <commit-hash> -- frontend/advisories.html

# Deploy old version
scp -P REDACTED_PORT frontend/advisories.html stormscout:~/public_html/

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
rsync -avz -e "ssh -p REDACTED_PORT" --exclude='node_modules' --exclude='.env' backend/ stormscout:~/storm-scout/

# Restart
ssh stormscout "touch ~/storm-scout/tmp/restart.txt"

# If successful, can merge rollback to main
# If not, can checkout main again
```

### Database Rollback

**Critical**: Always backup before migrations!

```bash
# Create backup before migration
ssh stormscout "mysqldump -u storm_scout -p storm_scout > ~/backups/storm_scout_$(date +%Y%m%d_%H%M%S).sql"

# If rollback needed, restore from backup
ssh stormscout "mysql -u storm_scout -p storm_scout < ~/backups/storm_scout_YYYYMMDD_HHMMSS.sql"

# Restart application after restore
ssh stormscout "touch ~/storm-scout/tmp/restart.txt"
```

## Backup Strategy

### Automated Daily Backups

Set up cron job on server:

```bash
# Edit crontab
ssh stormscout "crontab -e"

# Add this line (runs at 2 AM daily, keeps 30 days)
0 2 * * * mysqldump -u storm_scout -p'PASSWORD' storm_scout | gzip > ~/backups/storm_scout_$(date +\%Y\%m\%d).sql.gz && find ~/backups -name "storm_scout_*.sql.gz" -mtime +30 -delete
```

### Manual Backup

```bash
# Backup database
ssh stormscout "mysqldump -u storm_scout -p storm_scout | gzip > ~/backups/manual_$(date +%Y%m%d_%H%M%S).sql.gz"

# Download backup locally
scp -P REDACTED_PORT stormscout:~/backups/manual_*.sql.gz ~/local-backups/

# Backup application files
ssh stormscout "tar -czf ~/backups/app_$(date +%Y%m%d).tar.gz ~/storm-scout --exclude=node_modules --exclude=logs"
```

### Restore from Backup

```bash
# Decompress and restore
ssh stormscout "gunzip < ~/backups/storm_scout_20260213.sql.gz | mysql -u storm_scout -p storm_scout"

# Or restore uncompressed backup
ssh stormscout "mysql -u storm_scout -p storm_scout < ~/backups/storm_scout_20260213.sql"
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

-- Index for site queries
ALTER TABLE advisories ADD INDEX idx_site_id (site_id);

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

Currently, deployment is manual. Future improvements could include:

1. **GitHub Actions**: Automated testing on push
2. **Deployment Scripts**: Single-command deploy from local machine
3. **Environment Testing**: Automated API endpoint tests post-deploy
4. **Rollback Automation**: One-command rollback to previous version

## Documentation References

- [Backend API Documentation](./api.md)
- [Frontend Architecture](./frontend-architecture.md)
- [Database Schema](./database-schema.md)
- [VTEC Implementation](./vtec-implementation.md)

---

**Last Updated**: February 13, 2026  
**Maintained By**: IMT Operations Team
