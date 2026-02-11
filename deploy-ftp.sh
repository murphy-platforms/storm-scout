#!/bin/bash
# Storm Scout FTP Deployment Script
# Deploy using FTP with lftp

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Load FTP config
if [ -f .ftpconfig ]; then
    source .ftpconfig
else
    echo -e "${RED}✗${NC} .ftpconfig not found!"
    exit 1
fi

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

log_step() {
    echo -e "\n${BLUE}▶${NC} $1"
}

# Get FTP password from Keychain or environment
if [ -z "$FTP_PASSWORD" ]; then
    # Try to get from macOS Keychain
    FTP_PASSWORD=$(security find-internet-password -a "$FTP_USER" -s "$FTP_HOST" -w 2>/dev/null)
    
    if [ -z "$FTP_PASSWORD" ]; then
        # Prompt if not in Keychain
        echo -n "Enter FTP password: "
        read -s FTP_PASSWORD
        echo
        
        # Ask to save to Keychain
        read -p "Save password to macOS Keychain? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            security add-internet-password -a "$FTP_USER" -s "$FTP_HOST" -w "$FTP_PASSWORD" -l "Storm Scout FTP" 2>/dev/null
            log_info "Password saved to Keychain"
        fi
    else
        log_info "Using password from Keychain"
    fi
fi

# Display deployment info
echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║          Storm Scout FTP Deployment                       ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "  Server:   $FTP_HOST"
echo "  User:     $FTP_USER"
echo "  Backend:  $FTP_BACKEND_PATH"
echo "  Frontend: $FTP_FRONTEND_PATH"
echo ""

# Confirm deployment
read -p "Deploy to production? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_warn "Deployment cancelled"
    exit 0
fi

# Test FTP connection
log_step "Testing FTP connection..."
lftp -e "set ftp:ssl-allow no; open -u $FTP_USER,$FTP_PASSWORD $FTP_HOST:$FTP_PORT; ls; quit" > /dev/null 2>&1 || {
    log_error "FTP connection failed!"
    echo "Check:"
    echo "  - FTP host: $FTP_HOST"
    echo "  - FTP user: $FTP_USER"
    echo "  - Password is correct"
    exit 1
}
log_info "FTP connection successful"

# Deploy backend
log_step "Deploying backend..."
lftp -c "
set ftp:ssl-allow no
open -u $FTP_USER,$FTP_PASSWORD $FTP_HOST:$FTP_PORT
lcd ./backend
cd $FTP_BACKEND_PATH
mirror --reverse --delete --verbose \
    --exclude node_modules/ \
    --exclude .env \
    --exclude '*.db' \
    --exclude '*.db-shm' \
    --exclude '*.db-wal' \
    --exclude .DS_Store \
    ./ ./
quit
"
log_info "Backend deployed"

# Deploy frontend
log_step "Deploying frontend..."
lftp -c "
set ftp:ssl-allow no
open -u $FTP_USER,$FTP_PASSWORD $FTP_HOST:$FTP_PORT
lcd ./frontend
cd $FTP_FRONTEND_PATH
mirror --reverse --delete --verbose \
    --exclude .DS_Store \
    ./ ./
quit
"
log_info "Frontend deployed"

# Post-deployment instructions
log_step "Post-deployment steps..."
echo ""
echo "Now run these commands in cPanel Terminal:"
echo ""
echo "  cd ~/storm-scout"
echo "  source ~/nodevenv/storm-scout/20/bin/activate"
echo "  npm install --production"
echo ""
echo "  # If first deployment:"
echo "  npm run init-db"
echo "  npm run seed-db"
echo ""
echo "Then restart your Node.js app in cPanel"
echo ""

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║          ✓ Files Deployed!                                ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "  Your site: https://teammurphy.rocks"
echo ""
log_info "Don't forget to restart Node.js app in cPanel!"
echo ""
