#!/bin/bash
# Storm Scout Deployment Script
# Run on server after initial setup

set -e  # Exit on error

echo "🌩️  Storm Scout Deployment Script"
echo "=================================="
echo ""

# Configuration
APP_DIR="${DEPLOY_APP_DIR:-/var/www/storm-scout}"
BACKEND_DIR="$APP_DIR/backend"
FRONTEND_DIR="$APP_DIR/frontend"
DATA_DIR="$APP_DIR/data"
LOGS_DIR="$APP_DIR/logs"
DOMAIN="${DEPLOY_DOMAIN:-your-domain.example.com}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${GREEN}✓${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    log_error "Please do not run as root. Run as regular user with sudo access."
    exit 1
fi

# Navigate to app directory
if [ ! -d "$APP_DIR" ]; then
    log_error "Application directory not found: $APP_DIR"
    exit 1
fi

cd $APP_DIR

# Step 1: Pull latest code
log_info "Pulling latest code from GitHub..."
git pull origin main

# Step 2: Install backend dependencies
log_info "Installing backend dependencies..."
cd $BACKEND_DIR
# npm ci uses package-lock.json for deterministic installs (no silent version drift)
npm ci --production

# Step 3: Create required directories
log_info "Creating required directories..."
mkdir -p $DATA_DIR
mkdir -p $LOGS_DIR

# Step 4: Check for environment file
if [ ! -f "$BACKEND_DIR/.env.production" ]; then
    log_warn "Production environment file not found!"
    log_info "Creating from example..."
    cp $BACKEND_DIR/.env.production.example $BACKEND_DIR/.env.production
    log_warn "⚠️  IMPORTANT: Edit .env.production and update:"
    log_warn "   - NOAA_API_USER_AGENT with your email"
    log_warn "   - CORS_ORIGIN if needed"
    read -p "Press enter to continue after editing .env.production..."
fi

# Step 5: Database check
if [ ! -f "$DATA_DIR/storm-scout.db" ]; then
    log_info "Database not found. Initializing..."
    npm run init-db
    
    read -p "Do you want to seed with sample data? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        npm run seed-db
    fi
else
    log_info "Database exists, skipping initialization"
    log_warn "To reset database: rm -f $DATA_DIR/storm-scout.db && npm run init-db"
fi

# Step 5b: Run database migrations before restart. (closes #100)
# Migrations are idempotent — already-applied migrations are skipped safely.
# Set APPLY_MIGRATIONS=false to skip for code-only deploys.
APPLY_MIGRATIONS="${APPLY_MIGRATIONS:-true}"
if [ "$APPLY_MIGRATIONS" != "false" ]; then
    log_info "Running database migrations..."
    npm run migrate || { log_error "Migration failed — aborting deploy"; exit 1; }
    log_info "Migrations applied"
else
    log_warn "APPLY_MIGRATIONS=false — skipping migrations"
fi

# Step 6: Restart PM2 process
log_info "Restarting application with PM2..."
if pm2 describe storm-scout > /dev/null 2>&1; then
    pm2 restart storm-scout
    log_info "Application restarted"
else
    log_warn "PM2 process not found. Starting fresh..."
    pm2 start $BACKEND_DIR/src/server.js --name storm-scout --env production
    pm2 save
    log_info "Application started"
fi

# Step 7: Check application status
sleep 2
log_info "Checking application status..."
pm2 status storm-scout

# Step 8: Test health and key API endpoints with exponential backoff. (closes #99)
log_info "Verifying post-deploy endpoints..."
VERIFIED=false
for i in 1 2 3 4 5; do
    sleep $((i * 2))
    HEALTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health 2>/dev/null || echo "000")
    API_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/offices 2>/dev/null || echo "000")
    # Health returns 200 (ok) or 503 (degraded but running); both mean the process is alive
    if { [ "$HEALTH_CODE" = "200" ] || [ "$HEALTH_CODE" = "503" ]; } && [ "$API_CODE" = "200" ]; then
        log_info "Health endpoint: HTTP $HEALTH_CODE ✓"
        log_info "API endpoint:    HTTP $API_CODE ✓"
        VERIFIED=true
        break
    fi
    log_warn "Attempt $i/5 — health=$HEALTH_CODE api=$API_CODE — retrying..."
done
if [ "$VERIFIED" != "true" ]; then
    log_error "Post-deploy endpoint verification failed after 5 attempts"
    pm2 logs storm-scout --lines 20
    exit 1
fi

# Step 9: Check Nginx
log_info "Checking Nginx configuration..."
if sudo nginx -t > /dev/null 2>&1; then
    log_info "Nginx configuration is valid"
    log_info "Reloading Nginx..."
    sudo systemctl reload nginx
else
    log_error "Nginx configuration has errors!"
    sudo nginx -t
    exit 1
fi

# Completion
echo ""
echo "=================================="
echo -e "${GREEN}✓ Deployment Complete!${NC}"
echo "=================================="
echo ""
echo "📊 Application Status:"
pm2 status storm-scout
echo ""
echo "🌐 Storm Scout: https://$DOMAIN"
echo ""
echo "💡 Useful commands:"
echo "   pm2 logs storm-scout     - View logs"
echo "   pm2 restart storm-scout  - Restart app"
echo "   pm2 status              - Check status"
echo ""
echo "📚 Full docs: $APP_DIR/DEPLOYMENT.md"
