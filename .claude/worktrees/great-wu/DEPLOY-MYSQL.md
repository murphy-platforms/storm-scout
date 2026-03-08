# Storm Scout - MySQL Deployment Checklist

## ✅ Completed
- MySQL database created: `***REDACTED***`
- MySQL user created: `***REDACTED***` with ALL PRIVILEGES
- Code fully converted from SQLite to MySQL
- All changes committed to GitHub

## 📋 Deployment Steps

### 1. Update .env.production with MySQL Password
Before deploying, update the database password in `backend/.env.production`:

```bash
cd /Users/mmurphy/strom-scout/backend
# Edit .env.production and replace YOUR_PASSWORD_HERE with actual password
```

### 2. Deploy via FTP
```bash
cd /Users/mmurphy/strom-scout
./deploy-ftp.sh
```

### 3. Copy Files on Server (via cPanel Terminal)
```bash
# Copy from FTP location to Node.js app location
cp -r ~/your-domain.example.com/stormscout/* ~/storm-scout/

# Navigate to app directory
cd ~/storm-scout

# Activate Node.js environment
source ~/nodevenv/storm-scout/20/bin/activate
```

### 4. Install Dependencies
```bash
# Install mysql2 and other dependencies
npm install --production
```

### 5. Initialize Database
```bash
# Create schema (tables)
npm run init-db

# Seed with sample data
npm run seed-db
```

### 6. Update Environment Variables in cPanel
1. Go to cPanel → **Node.js**
2. Find the "storm-scout" application
3. Update environment variables to include MySQL credentials:
   - `DB_HOST = localhost`
   - `DB_PORT = 3306`
   - `DB_USER = ***REDACTED***`
   - `DB_PASSWORD = [your MySQL password]`
   - `DB_NAME = ***REDACTED***`
4. Remove old variable:
   - Delete `DATABASE_PATH` (no longer needed)

### 7. Restart Node.js Application
In cPanel Node.js interface:
- Click **"RESTART"** button
- Wait for status to show "Running"

### 8. Verify Deployment

**Check Backend Health:**
```bash
curl https://your-domain.example.com/health
```

**Expected response:**
```json
{"status":"ok"}
```

**Test Frontend:**
Open browser: https://your-domain.example.com

**Check Database Connection:**
```bash
# In cPanel Terminal
cd ~/storm-scout
source ~/nodevenv/storm-scout/20/bin/activate
node -e "const db = require('./src/config/database'); db.initDatabase().then(() => console.log('DB OK')).catch(console.error)"
```

## 🔍 Troubleshooting

### Application Won't Start
1. Check logs in cPanel Node.js interface
2. Verify all environment variables are set correctly
3. Ensure MySQL password is correct in environment variables

### Database Connection Errors
1. Verify database exists: `***REDACTED***`
2. Check user permissions in cPanel MySQL Databases
3. Confirm credentials in environment variables match cPanel

### "Cannot find module 'mysql2'"
Run `npm install --production` in the app directory

### Import/Seeding Fails
1. Check if database is empty: `npm run init-db` should run first
2. Verify schema was created successfully
3. Check MySQL error logs if available

## 📊 Database Commands (cPanel Terminal)

### Check Database Status
```bash
mysql -u ***REDACTED*** -p ***REDACTED*** -e "SHOW TABLES;"
```

### View Sites Count
```bash
mysql -u ***REDACTED*** -p ***REDACTED*** -e "SELECT COUNT(*) FROM sites;"
```

### Clear Database (if needed)
```bash
cd ~/storm-scout
source ~/nodevenv/storm-scout/20/bin/activate
mysql -u ***REDACTED*** -p ***REDACTED*** -e "DROP DATABASE ***REDACTED***; CREATE DATABASE ***REDACTED***;"
npm run init-db
npm run seed-db
```

## 🎯 Success Criteria
- [ ] Backend health check returns `{"status":"ok"}`
- [ ] Frontend loads at https://your-domain.example.com
- [ ] Dashboard displays 220 testing sites
- [ ] Weather alerts load (if any active)
- [ ] No errors in cPanel application logs
- [ ] MySQL database contains data (check with SHOW TABLES)

## 📝 Notes
- Database runs on MariaDB 11.4.9 (MySQL-compatible)
- Node.js version: 20.20.0
- mysql2 package version: ^3.6.5
- Environment: Production
- CORS origin: https://your-domain.example.com
