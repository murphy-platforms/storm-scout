# Storm Scout - Deployment Guide

Deploy Storm Scout to **teammurphy.rocks** on Spaceship.com hosting.

## Deployment Architecture

```
teammurphy.rocks
├── Frontend (Static files) - Served by web server
└── Backend API at /api - Node.js app (proxied)
```

## Prerequisites

### On Spaceship.com
- VPS or Node.js hosting plan
- SSH access to server
- Domain: teammurphy.rocks configured in DNS

### Required Software on Server
- Node.js 20 LTS
- Nginx or Apache (for reverse proxy)
- PM2 (for process management)
- Git

## Deployment Steps

### 1. Server Setup

SSH into your server:
```bash
ssh user@teammurphy.rocks
```

Install Node.js 20 LTS:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

Install PM2 (process manager):
```bash
sudo npm install -g pm2
```

### 2. Clone Repository

```bash
cd /var/www
sudo git clone https://github.com/404-nullsignal/storm-scout.git
cd storm-scout
sudo chown -R $USER:$USER /var/www/storm-scout
```

### 3. Configure Backend

```bash
cd /var/www/storm-scout/backend
npm install --production

# Create production environment file
cp .env.example .env.production
```

Edit `.env.production`:
```bash
PORT=3000
NODE_ENV=production
DATABASE_PATH=/var/www/storm-scout/data/storm-scout.db
INGESTION_ENABLED=true
INGESTION_INTERVAL_MINUTES=15
NOAA_API_BASE_URL=https://api.weather.gov
NOAA_API_USER_AGENT=StormScout/1.0 (your-email@example.com)
CORS_ORIGIN=https://teammurphy.rocks
LOG_LEVEL=info
```

Create data directory:
```bash
sudo mkdir -p /var/www/storm-scout/data
sudo chown $USER:$USER /var/www/storm-scout/data
```

Initialize database:
```bash
npm run init-db
npm run seed-db  # Optional: sample data
```

### 4. Configure Frontend

Update API URL for production:
```bash
cd /var/www/storm-scout/frontend/js
```

Edit `api.js` line 6:
```javascript
const API_BASE_URL = 'https://teammurphy.rocks/api';
```

### 5. Start Backend with PM2

```bash
cd /var/www/storm-scout/backend

# Start with PM2
pm2 start src/server.js --name storm-scout --env production

# Save PM2 process list
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Follow the command output instructions
```

### 6. Configure Nginx

Create Nginx configuration:
```bash
sudo nano /etc/nginx/sites-available/teammurphy.rocks
```

Paste this configuration (see `deployment/nginx.conf`):

```nginx
server {
    listen 80;
    server_name teammurphy.rocks www.teammurphy.rocks;

    # Redirect to HTTPS (after SSL setup)
    # return 301 https://$server_name$request_uri;

    # Frontend - Static files
    root /var/www/storm-scout/frontend;
    index index.html;

    # Frontend pages
    location / {
        try_files $uri $uri/ =404;
    }

    # Backend API - Proxy to Node.js
    location /api/ {
        proxy_pass http://localhost:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://localhost:3000/health;
        access_log off;
    }
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/teammurphy.rocks /etc/nginx/sites-enabled/
sudo nginx -t  # Test configuration
sudo systemctl restart nginx
```

### 7. SSL Certificate (HTTPS)

Install Certbot:
```bash
sudo apt-get install certbot python3-certbot-nginx
```

Get SSL certificate:
```bash
sudo certbot --nginx -d teammurphy.rocks -d www.teammurphy.rocks
```

Certbot will automatically update your Nginx config for HTTPS.

### 8. DNS Configuration on Spaceship.com

In your Spaceship.com DNS management:

**A Record:**
```
Type: A
Name: @
Value: [Your Server IP]
TTL: 3600
```

**WWW Record:**
```
Type: CNAME
Name: www
Value: teammurphy.rocks
TTL: 3600
```

## Verification

### Check Backend
```bash
curl http://localhost:3000/health
# Should return: {"status":"ok","timestamp":"...","environment":"production"}
```

### Check PM2 Status
```bash
pm2 status
pm2 logs storm-scout
```

### Check Nginx
```bash
sudo systemctl status nginx
sudo nginx -t
```

### Test Live Site
```bash
curl https://teammurphy.rocks/api/sites
curl https://teammurphy.rocks/health
```

Open browser: **https://teammurphy.rocks**

## Maintenance

### View Logs
```bash
pm2 logs storm-scout
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Update Application
```bash
cd /var/www/storm-scout
git pull origin main
cd backend && npm install --production
pm2 restart storm-scout
```

### Restart Services
```bash
pm2 restart storm-scout
sudo systemctl restart nginx
```

### Database Backup
```bash
cp /var/www/storm-scout/data/storm-scout.db /var/www/storm-scout/data/storm-scout.db.backup.$(date +%Y%m%d)
```

## Troubleshooting

### Backend won't start
```bash
pm2 logs storm-scout --lines 100
```

### Frontend shows CORS errors
- Check `.env.production` has `CORS_ORIGIN=https://teammurphy.rocks`
- Restart backend: `pm2 restart storm-scout`

### 502 Bad Gateway
- Check backend is running: `pm2 status`
- Check port 3000: `netstat -tulpn | grep 3000`

### Database errors
- Check permissions: `ls -la /var/www/storm-scout/data/`
- Re-initialize: `cd backend && npm run init-db`

## Security Checklist

- [ ] HTTPS enabled with valid SSL certificate
- [ ] Firewall configured (allow 80, 443, SSH only)
- [ ] Database file not publicly accessible
- [ ] `.env` files not in web root
- [ ] PM2 running as non-root user
- [ ] Regular database backups scheduled
- [ ] Nginx security headers configured

## Performance Optimization

### Enable Gzip in Nginx
Add to server block:
```nginx
gzip on;
gzip_types text/css application/javascript application/json;
gzip_min_length 1000;
```

### Cache Static Assets
```nginx
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

## Alternative Deployment Options

### Option 1: Docker (Recommended)
See `deployment/docker-compose.yml` for containerized deployment.

### Option 2: Platform-as-a-Service
- **Heroku**: Easy deployment with Git push
- **Railway**: Modern PaaS with free tier
- **Render**: Auto-deploy from GitHub

### Option 3: Static Frontend Hosting
- Deploy frontend to Cloudflare Pages, Netlify, or Vercel
- Keep backend on VPS
- Update `API_BASE_URL` to point to VPS

---

**Need help?** Check the repository issues or contact support.
