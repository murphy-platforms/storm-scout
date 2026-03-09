#!/bin/bash
# Storm Scout Deployment Script
# Deploy from local Mac to cPanel hosting

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration — set via environment variables or .deploy.config
# Example: DEPLOY_HOST=your-server.example.com DEPLOY_USER=youruser ./deploy.sh
SERVER_HOST="${DEPLOY_HOST:-your-server.example.com}"
SERVER_USER="${DEPLOY_USER:-your_ssh_user}"
SERVER_PORT="${DEPLOY_PORT:-22}"
SERVER_BACKEND_PATH="${DEPLOY_BACKEND_PATH:-~/storm-scout}"
SERVER_FRONTEND_PATH="${DEPLOY_FRONTEND_PATH:-~/public_html}"

# SSH command with port
SSH_CMD="ssh -p $SERVER_PORT"
RSYNC_SSH="ssh -p $SERVER_PORT"

# Local paths
LOCAL_BACKEND="./backend/"
LOCAL_FRONTEND="./frontend/"

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

# Check if SSH connection works
check_connection() {
    log_step "Checking server connection..."
    if $SSH_CMD -o ConnectTimeout=5 "$SERVER_USER@$SERVER_HOST" "echo 'Connected'" > /dev/null 2>&1; then
        log_info "SSH connection successful"
        return 0
    else
        log_error "Cannot connect to server"
        echo ""
        echo "Please check:"
        echo "  1. Server host: $SERVER_HOST"
        echo "  2. SSH username: $SERVER_USER"
        echo "  3. SSH key is configured"
        echo ""
        echo "Try: ssh $SERVER_USER@$SERVER_HOST"
        exit 1
    fi
}

# Display deployment info
show_deployment_info() {
    echo ""
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║          Storm Scout Deployment                           ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo ""
    echo "  Server:   $SERVER_USER@$SERVER_HOST"
    echo "  Backend:  $SERVER_BACKEND_PATH"
    echo "  Frontend: $SERVER_FRONTEND_PATH"
    echo ""
}

# Confirm deployment
confirm_deployment() {
    read -p "Deploy to production? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_warn "Deployment cancelled"
        exit 0
    fi
}

# Create timestamped backup of current production files before rsync --delete runs.
# Backups older than 7 days are pruned automatically.
create_backup() {
    local timestamp
    timestamp=$(date +%Y%m%d_%H%M%S)
    BACKUP_TIMESTAMP="$timestamp"  # exported for use in main()

    log_step "Creating pre-deploy backup (tag: $timestamp)..."

    $SSH_CMD "$SERVER_USER@$SERVER_HOST" bash -s << ENDSSH
        set -e
        TIMESTAMP="$timestamp"
        BACKEND="$SERVER_BACKEND_PATH"
        FRONTEND="$SERVER_FRONTEND_PATH"

        # Backup backend directory
        if [ -d "\$BACKEND" ]; then
            cp -a "\$BACKEND" "\${BACKEND}.bak.\${TIMESTAMP}"
            echo "  Backend  → \${BACKEND}.bak.\${TIMESTAMP}"
        fi

        # Backup frontend directory
        if [ -d "\$FRONTEND" ]; then
            cp -a "\$FRONTEND" "\${FRONTEND}.bak.\${TIMESTAMP}"
            echo "  Frontend → \${FRONTEND}.bak.\${TIMESTAMP}"
        fi

        # Prune backups older than 7 days (keep disk usage bounded)
        PARENT_BACKEND=\$(dirname "\$BACKEND")
        PARENT_FRONTEND=\$(dirname "\$FRONTEND")
        find "\$PARENT_BACKEND" -maxdepth 1 -name "\$(basename \$BACKEND).bak.*" -mtime +7 -exec rm -rf {} + 2>/dev/null || true
        find "\$PARENT_FRONTEND" -maxdepth 1 -name "\$(basename \$FRONTEND).bak.*" -mtime +7 -exec rm -rf {} + 2>/dev/null || true
        echo "  Old backups (>7d) pruned"
ENDSSH

    log_info "Backup complete — tag: $timestamp"
}

# Deploy backend
deploy_backend() {
    log_step "Deploying backend..."
    
    # Sync files (exclude node_modules, .env, .db files)
    rsync -avz -e "$RSYNC_SSH" --delete \
        --exclude 'node_modules/' \
        --exclude '*.db' \
        --exclude '*.db-shm' \
        --exclude '*.db-wal' \
        --exclude '.env' \
        --exclude '.DS_Store' \
        --exclude 'tmp/' \
        "$LOCAL_BACKEND" "$SERVER_USER@$SERVER_HOST:$SERVER_BACKEND_PATH/"
    
    log_info "Backend files synced"
}

# Deploy frontend
deploy_frontend() {
    log_step "Deploying frontend..."
    
    # Sync frontend files
    rsync -avz -e "$RSYNC_SSH" --delete \
        --exclude '.DS_Store' \
        "$LOCAL_FRONTEND" "$SERVER_USER@$SERVER_HOST:$SERVER_FRONTEND_PATH/"
    
    log_info "Frontend files synced"
}

# Install dependencies and restart
post_deploy() {
    log_step "Installing dependencies and restarting app..."
    
    $SSH_CMD "$SERVER_USER@$SERVER_HOST" /bin/bash << 'EOF'
        cd ~/storm-scout
        
        # Activate Node environment
        source ~/nodevenv/storm-scout/20/bin/activate 2>/dev/null || true
        
        # Install dependencies
        echo "Installing npm packages..."
        npm install --production
        
        # Check if database exists, if not initialize
        if [ ! -f "storm-scout.db" ]; then
            echo "Initializing database..."
            npm run init-db
            npm run seed-db
        fi
        
        echo "Deployment complete on server!"
EOF
    
    log_info "Dependencies installed"
}

# Restart Node.js app (via cPanel or PM2)
restart_app() {
    log_step "Restarting application..."
    
    log_warn "Please restart your Node.js app in cPanel"
    echo ""
    echo "  1. Go to cPanel → Node.js"
    echo "  2. Find 'storm-scout' application"
    echo "  3. Click 'Restart'"
    echo ""
    read -p "Press enter when done..."
    
    log_info "Application restarted"
}

# [OPS-1] Pause ingestion before schema migration to prevent old-code/new-schema conflicts
pause_ingestion() {
    log_step "Pausing weather data ingestion..."
    
    $SSH_CMD "$SERVER_USER@$SERVER_HOST" /bin/bash << 'EOF'
        cd ~/storm-scout
        # Set INGESTION_ENABLED=false in .env
        if grep -q '^INGESTION_ENABLED=' .env 2>/dev/null; then
            sed -i 's/^INGESTION_ENABLED=.*/INGESTION_ENABLED=false/' .env
        else
            echo 'INGESTION_ENABLED=false' >> .env
        fi
        echo "Ingestion paused. Waiting 30s for any in-progress cycle to complete..."
        sleep 30
EOF
    
    log_info "Ingestion paused on production"
}

# [OPS-1] Resume ingestion after deploy
resume_ingestion() {
    log_step "Resuming weather data ingestion..."
    
    $SSH_CMD "$SERVER_USER@$SERVER_HOST" /bin/bash << 'EOF'
        cd ~/storm-scout
        sed -i 's/^INGESTION_ENABLED=.*/INGESTION_ENABLED=true/' .env
        echo "Ingestion resumed."
EOF
    
    log_info "Ingestion resumed on production"
}

# Main deployment flow
main() {
    show_deployment_info
    check_connection
    confirm_deployment
    
    # [OPS-1] Pause ingestion during deploy window
    pause_ingestion

    # Create backup before any destructive rsync --delete operations
    create_backup

    deploy_backend
    deploy_frontend
    post_deploy
    restart_app

    # [OPS-1] Resume ingestion after restart
    resume_ingestion

    echo ""
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║          ✓ Deployment Complete!                           ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo ""
    echo "  Storm Scout: https://$SERVER_HOST  (update DEPLOY_HOST for your USPS server)"
    echo ""
    echo "  Backup tag: $BACKUP_TIMESTAMP"
    echo "  To rollback if needed:"
    echo "    ssh $SERVER_USER@$SERVER_HOST"
    echo "    cp -a ${SERVER_BACKEND_PATH}.bak.${BACKUP_TIMESTAMP} $SERVER_BACKEND_PATH"
    echo "    cp -a ${SERVER_FRONTEND_PATH}.bak.${BACKUP_TIMESTAMP} $SERVER_FRONTEND_PATH"
    echo "    (then restart the app)"
    echo "  See DEPLOY.md for full rollback procedure."
    echo ""
    log_info "Storm Scout is live!"
    echo ""
}

# Handle errors
trap 'log_error "Deployment failed!"; exit 1' ERR

# Run deployment
main
