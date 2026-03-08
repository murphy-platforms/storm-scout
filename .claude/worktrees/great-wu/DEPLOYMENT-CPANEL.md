# Storm Scout - cPanel/Spaceship.com Deployment

Deploy Storm Scout to your cPanel hosting (Spaceship.com) with Node.js support.

## Prerequisites
- cPanel account with Node.js support (✓ You have this!)
- FTP/File Manager access
- MySQL/MariaDB database (✓ Created: ***REDACTED***)
- Domain: your-domain.example.com

## Deployment Steps

### Step 1: Upload Files via FTP or File Manager

#### Option A: FTP Upload
1. Connect via FTP client (FileZilla, Cyberduck, etc.)
   - Host: `ftp.your-domain.example.com` or your server IP
   - Username: Your cPanel username
   - Password: Your cPanel password

2. Navigate to your home directory (e.g., `/home/username/`)

3. Create directory structure:
   ```
   /home/username/
   ├── storm-scout/          (Upload entire backend folder here)
   └── public_html/          (Upload frontend files here)
   ```

4. Upload files:
   - Upload **backend/** contents to `/home/username/storm-scout/`
   - Upload **frontend/** contents to `/home/username/public_html/`

#### Option B: File Manager (Easier)
1. In cPanel, go to **File Manager**
2. Create a new folder: `storm-scout`
3. Upload `backend.zip` (create zip locally first)
4. Extract the backend files
5. Upload frontend files to `public_html`

### Step 2: Prepare Backend for Upload

On your local machine, create a production-ready package:

```bash
cd /Users/mmurphy/strom-scout/backend

# Create .env.production with MySQL credentials
cat > .env.production << 'EOF'
PORT=3000
NODE_ENV=production

# MySQL Database
DB_HOST=localhost
DB_PORT=3306
DB_USER=***REDACTED***
DB_PASSWORD=YOUR_MYSQL_PASSWORD_HERE
DB_NAME=***REDACTED***

INGESTION_ENABLED=true
INGESTION_INTERVAL_MINUTES=15
NOAA_API_BASE_URL=https://api.weather.gov
NOAA_API_USER_AGENT=StormScout/1.0 (your-email@example.com)
CORS_ORIGIN=https://your-domain.example.com
LOG_LEVEL=info
EOF

# Create a zip for easy upload
cd ..
zip -r storm-scout-backend.zip backend/ -x "backend/node_modules/*" -x "backend/*.db*"
```

### Step 3: Configure Node.js Application in cPanel

1. **Go to cPanel → Node.js**
2. **Click "CREATE APPLICATION"**
3. **Fill in the form:**

   ```
   Node.js version: 20.x (or 14.21.3 as shown)
   Application mode: Production
   Application root: storm-scout
   Application URL: your-domain.example.com (or use subdomain like api.your-domain.example.com)
   Application startup file: src/server.js
   ```

4. **Add Environment Variables:**
   Click "ADD VARIABLE" and add these:

   ```
   NODE_ENV = production
   PORT = 3000
   
   # MySQL Database Configuration
   DB_HOST = localhost
   DB_PORT = 3306
   DB_USER = ***REDACTED***
   DB_PASSWORD = YOUR_MYSQL_PASSWORD
   DB_NAME = ***REDACTED***
   
   INGESTION_ENABLED = true
   INGESTION_INTERVAL_MINUTES = 15
   NOAA_API_BASE_URL = https://api.weather.gov
   NOAA_API_USER_AGENT = StormScout/1.0 (your-email@example.com)
   CORS_ORIGIN = https://your-domain.example.com
   LOG_LEVEL = info
   ```

5. **Click "CREATE"**

### Step 4: Install Dependencies via Terminal

1. In cPanel, go to **Terminal** (if available) or use SSH
2. Navigate to your app directory:
   ```bash
   cd ~/storm-scout
   source /home/username/nodevenv/storm-scout/20/bin/activate
   npm install --production
   ```

If Terminal is not available:
- cPanel will auto-install dependencies when you create the app
- Or use the "Run NPM Install" button in the Node.js interface

### Step 5: Initialize MySQL Database

In cPanel Terminal or SSH:

```bash
cd ~/storm-scout
source /home/username/nodevenv/storm-scout/20/bin/activate

# Initialize database schema
npm run init-db

# Seed with sample data (optional)
npm run seed-db
```

**Note:** The database `***REDACTED***` should already be created in cPanel MySQL Databases section with user `***REDACTED***` having ALL PRIVILEGES.

### Step 6: Update Frontend API URL

1. In cPanel File Manager, navigate to `public_html/js/api.js`
2. Edit line 6:

   **If using main domain:**
   ```javascript
   const API_BASE_URL = 'https://your-domain.example.com/api';
   ```

   **If using subdomain (recommended):**
   ```javascript
   const API_BASE_URL = 'https://api.your-domain.example.com/api';
   ```

### Step 7: Configure Reverse Proxy (If using main domain)

If you want both frontend and backend on `your-domain.example.com`:

1. Create `.htaccess` in `public_html`:

```apache
# Proxy API requests to Node.js backend
RewriteEngine On
RewriteCond %{REQUEST_URI} ^/api/
RewriteRule ^api/(.*)$ http://localhost:3000/api/$1 [P,L]

# Proxy health check
RewriteCond %{REQUEST_URI} ^/health
RewriteRule ^health$ http://localhost:3000/health [P,L]

# Frontend - serve static files
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^(.*)$ $1 [L]
```

### Step 8: Start the Application

1. In cPanel → Node.js
2. Find your application
3. Click **"START APP"** or **"RESTART"**
4. Wait for status to show "Running"

### Step 9: Set Up SSL (HTTPS)

1. In cPanel → **SSL/TLS Status**
2. Find `your-domain.example.com`
3. Click **"Run AutoSSL"**
4. Wait for certificate to be issued (usually instant)

Or use Let's Encrypt if available in your cPanel.

### Step 10: Verify Deployment

**Test Backend:**
```bash
curl https://your-domain.example.com/health
# or
curl https://api.your-domain.example.com/health
```

**Test Frontend:**
Open browser: `https://your-domain.example.com`

## Alternative: Subdomain Setup (Recommended)

This is cleaner and avoids reverse proxy complexity:

### 1. Create Subdomain
- cPanel → **Subdomains**
- Subdomain: `api`
- Domain: `your-domain.example.com`
- Document Root: `/home/username/storm-scout` (or leave default)

### 2. Configure Node.js App
- Application URL: `api.your-domain.example.com`
- Application root: `storm-scout`

### 3. Update Frontend
```javascript
// frontend/js/api.js
const API_BASE_URL = 'https://api.your-domain.example.com/api';
```

This setup gives you:
- Frontend: `https://your-domain.example.com`
- Backend API: `https://api.your-domain.example.com/api`

## File Structure on Server

```
/home/username/
├── storm-scout/              # Backend (Node.js app)
│   ├── src/
│   │   ├── server.js        # Startup file
│   │   ├── config/
│   │   ├── models/
│   │   ├── routes/
│   │   └── data/
│   ├── package.json
│   ├── package-lock.json
│   ├── storm-scout.db       # SQLite database
│   └── node_modules/        # Auto-installed
│
└── public_html/             # Frontend (static files)
    ├── index.html
    ├── advisories.html
    ├── sites.html
    ├── notices.html
    ├── sources.html
    ├── css/
    └── js/
        ├── api.js          # UPDATE API_BASE_URL here
        └── utils.js

```

## Troubleshooting

### Application won't start
1. Check logs in cPanel Node.js interface
2. Verify `package.json` exists in application root
3. Ensure all dependencies are installed
4. Check environment variables are set

### Database errors
```bash
cd ~/storm-scout
rm -f storm-scout.db*
npm run init-db
```

### CORS errors in browser
- Check `CORS_ORIGIN` environment variable matches your domain
- Restart the Node.js application after changing env vars

### Frontend can't reach backend
- Check API_BASE_URL in `frontend/js/api.js`
- Test backend directly: `curl https://your-domain.example.com/api/sites`
- Check browser console for specific error

### Updates/Redeployment

To update your application:

1. Upload new files via FTP
2. In cPanel Terminal:
   ```bash
   cd ~/storm-scout
   source /home/username/nodevenv/storm-scout/20/bin/activate
   npm install --production
   ```
3. In cPanel → Node.js → Restart application

## Performance Tips

1. **Use Production Mode:** Ensure `NODE_ENV=production` in environment variables
2. **Enable Gzip:** Add to `.htaccess`:
   ```apache
   <IfModule mod_deflate.c>
     AddOutputFilterByType DEFLATE text/html text/plain text/css application/javascript
   </IfModule>
   ```
3. **Cache Static Assets:** Add to `.htaccess`:
   ```apache
   <IfModule mod_expires.c>
     ExpiresActive On
     ExpiresByType text/css "access plus 1 year"
     ExpiresByType application/javascript "access plus 1 year"
   </IfModule>
   ```

## Security Checklist

- [ ] SSL/HTTPS enabled
- [ ] `.env` files not in public_html
- [ ] Database file not in public_html
- [ ] CORS_ORIGIN set to your domain only
- [ ] Regular backups enabled in cPanel

## Support

- cPanel documentation: Check your hosting provider's knowledge base
- Storm Scout issues: https://github.com/404-nullsignal/storm-scout/issues

---

**You're ready to deploy! Your cPanel Node.js support makes this straightforward.** 🚀
