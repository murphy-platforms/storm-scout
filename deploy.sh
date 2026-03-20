#!/bin/bash
# Storm Scout Deployment Script
# Deploy from local machine to remote server

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
SERVER_FRONTEND_PATH="${DEPLOY_FRONTEND_PATH:-~/public_html/stormscout}"
FRONTEND_RSYNC_DELETE="${FRONTEND_RSYNC_DELETE:-false}"
ALLOW_ROOT_DOCROOT_DEPLOY="${ALLOW_ROOT_DOCROOT_DEPLOY:-false}"

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
# Prevent accidental overwrite of a primary website docroot when Storm Scout
# should be deployed to a subdirectory (e.g. ~/public_html/stormscout).
validate_frontend_target() {
    case "$SERVER_FRONTEND_PATH" in
        "~/public_html"|"/home/"*/"public_html"|"/home/"*/"public_html/"|"/home2/"*/"public_html"|"/home2/"*/"public_html/")
            if [ "$ALLOW_ROOT_DOCROOT_DEPLOY" != "true" ]; then
                log_error "Refusing to deploy Storm Scout frontend to root docroot: $SERVER_FRONTEND_PATH"
                echo ""
                echo "This can overwrite another site hosted on the same cPanel account."
                echo "Use a dedicated subpath, e.g.: DEPLOY_FRONTEND_PATH=~/public_html/stormscout"
                echo "If root deployment is intentional, override explicitly:"
                echo "  ALLOW_ROOT_DOCROOT_DEPLOY=true ./deploy.sh"
                exit 1
            fi
            log_warn "ALLOW_ROOT_DOCROOT_DEPLOY=true — root docroot deployment explicitly allowed"
            ;;
    esac
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

# Run local smoke test as a pre-deploy gate. (closes #99)
# Starts a local server instance, runs 11 endpoint checks, exits 1 on any failure.
# Set SKIP_SMOKE_TEST=true to bypass (emergency deploys only).
run_smoke_test() {
    if [ "${SKIP_SMOKE_TEST:-false}" = "true" ]; then
        log_warn "SKIP_SMOKE_TEST=true — skipping pre-deploy smoke test"
        return 0
    fi

    log_step "Running pre-deploy smoke test..."

    if [ ! -f "./backend/scripts/smoke-test.sh" ]; then
        log_warn "Smoke test script not found — skipping"
        return 0
    fi

    (cd ./backend && bash scripts/smoke-test.sh)
    local exit_code=$?

    if [ $exit_code -ne 0 ]; then
        log_error "Smoke test FAILED — deploy aborted"
        log_warn "Fix the failing checks above before deploying."
        log_warn "To bypass in an emergency: SKIP_SMOKE_TEST=true ./deploy.sh"
        exit 1
    fi

    log_info "Smoke test passed"
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

    # Safe by default:
    # - preserve .htaccess (Passenger routing in cPanel/shared hosting)
    # - avoid destructive deletes unless explicitly requested
    local rsync_opts=(-avz -e "$RSYNC_SSH")
    rsync_opts+=(--exclude '.DS_Store')
    rsync_opts+=(--exclude '.htaccess')
    rsync_opts+=(--exclude '.well-known/')
    rsync_opts+=(--exclude 'cgi-bin/')

    if [ "$FRONTEND_RSYNC_DELETE" = "true" ]; then
        rsync_opts+=(--delete)
        log_warn "FRONTEND_RSYNC_DELETE=true — frontend rsync will delete remote files not present locally"
    else
        log_info "Safe frontend sync mode (no --delete). Set FRONTEND_RSYNC_DELETE=true to enable destructive cleanup."
    fi

    rsync "${rsync_opts[@]}" \
        "$LOCAL_FRONTEND" "$SERVER_USER@$SERVER_HOST:$SERVER_FRONTEND_PATH/"

    # Warn immediately if Passenger routing file is missing after sync.
    if ! $SSH_CMD "$SERVER_USER@$SERVER_HOST" "[ -f \"$SERVER_FRONTEND_PATH/.htaccess\" ]"; then
        log_warn "No .htaccess found at $SERVER_FRONTEND_PATH — Passenger routing may be broken"
    fi
    log_info "Frontend files synced"
}
# Verify remote STATIC_FILES_PATH resolves to a directory containing index.html.
# This catches split-path cPanel misconfigurations where backend app root and
# frontend docroot are deployed separately.
verify_remote_static_files_path() {
    log_step "Validating remote STATIC_FILES_PATH..."

    $SSH_CMD "$SERVER_USER@$SERVER_HOST" /bin/bash << EOF
        set -e
        BACKEND_PATH="$SERVER_BACKEND_PATH"
        BACKEND_PATH="\${BACKEND_PATH/#\~/\$HOME}"
        ENV_FILE="\$BACKEND_PATH/.env"

        if [ ! -f "\$ENV_FILE" ]; then
            echo "[ERROR] Missing environment file: \$ENV_FILE"
            exit 1
        fi

        STATIC_RAW=\$(grep -E '^STATIC_FILES_PATH=' "\$ENV_FILE" | tail -n 1 | cut -d= -f2-)
        if [ -z "\$STATIC_RAW" ]; then
            echo "[ERROR] STATIC_FILES_PATH is not set in \$ENV_FILE"
            exit 1
        fi

        if [[ "\$STATIC_RAW" == /* ]]; then
            STATIC_PATH="\$STATIC_RAW"
        else
            STATIC_PATH="\$BACKEND_PATH/\$STATIC_RAW"
        fi

        if [ ! -d "\$STATIC_PATH" ]; then
            echo "[ERROR] STATIC_FILES_PATH directory does not exist: \$STATIC_PATH"
            exit 1
        fi

        if [ ! -f "\$STATIC_PATH/index.html" ]; then
            echo "[ERROR] Missing index.html under STATIC_FILES_PATH: \$STATIC_PATH/index.html"
            exit 1
        fi

        echo "Resolved STATIC_FILES_PATH: \$STATIC_PATH"
EOF

    log_info "Remote STATIC_FILES_PATH is valid"
}

# Install dependencies, run migrations, prepare for restart. (closes #100)
# Migrations run AFTER npm ci (new migration files may ship with this deploy)
# and BEFORE the app restarts (new code expects the new schema).
# Set APPLY_MIGRATIONS=false to skip migrations for code-only deploys.
post_deploy() {
    log_step "Installing dependencies and running migrations..."

    local apply_migrations="${APPLY_MIGRATIONS:-true}"

    $SSH_CMD "$SERVER_USER@$SERVER_HOST" /bin/bash << EOF
        set -e
        APP_ROOT=\"$SERVER_BACKEND_PATH\"
        APP_ROOT=\"\${APP_ROOT/#\\~/\\$HOME}\"
        cd \"\\$APP_ROOT\"

        # Activate Node environment (if applicable)
        source "${NODE_ENV_ACTIVATE:-/dev/null}" 2>/dev/null || true

        # Install production dependencies (npm ci uses package-lock.json for
        # deterministic installs — no silent version drift).
        echo "Installing npm packages..."
        npm ci --omit=dev --ignore-scripts

        # Run pending database migrations before app restart.
        if [ "$apply_migrations" != "false" ]; then
            echo "Running database migrations..."
            npm run migrate || { echo "[ERROR] Migration failed — aborting deploy"; exit 1; }
            echo "Migrations complete."
        else
            echo "APPLY_MIGRATIONS=false — skipping migrations"
        fi

        echo "Server-side deploy steps complete."
EOF

    log_info "Dependencies installed and migrations applied"
}

# Restart Node.js app (via hosting control panel or process manager)
restart_app() {
    log_step "Restarting application..."

    log_warn "Please restart your Node.js application"
    echo ""
    echo "  Restart using your hosting provider's control panel"
    echo "  or process manager (PM2, systemd, etc.)"
    echo ""
    read -p "Press enter when done..."

    log_info "Application restarted"
}

# [OPS-1] Pause ingestion via the admin API before migration/deploy.
# Calls POST /api/admin/pause-ingestion which stops the scheduler in-process and
# waits for any active cycle to finish — the old sed+sleep approach edited .env
# but Node reads env at startup only, so it had no effect on the running process. (closes #112)
# Requires DEPLOY_API_KEY env var (same value as API_KEY on the server).
pause_ingestion() {
    log_step "Pausing weather data ingestion via admin API..."

    if [ -z "${DEPLOY_API_KEY:-}" ]; then
        log_warn "DEPLOY_API_KEY not set — skipping ingestion pause (set it to API_KEY from server .env)"
        return 0
    fi

    local base_url="https://$SERVER_HOST"
    local response
    response=$(curl -s -o /tmp/pause_response.json -w "%{http_code}" \
        -X POST \
        -H "X-Api-Key: $DEPLOY_API_KEY" \
        "$base_url/api/admin/pause-ingestion" 2>/dev/null || echo "000")

    if [ "$response" = "200" ]; then
        log_info "Ingestion paused — active cycle (if any) has completed"
    else
        log_warn "Pause API returned HTTP $response (server may not be running yet — continuing)"
        cat /tmp/pause_response.json 2>/dev/null || true
    fi
}

# [OPS-1] Resume ingestion after deploy completes.
# On error, this is also called by the ERR trap to prevent permanently disabled ingestion.
resume_ingestion() {
    log_step "Resuming weather data ingestion via admin API..."

    if [ -z "${DEPLOY_API_KEY:-}" ]; then
        log_warn "DEPLOY_API_KEY not set — skipping ingestion resume"
        return 0
    fi

    local base_url="https://$SERVER_HOST"
    local response
    response=$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST \
        -H "X-Api-Key: $DEPLOY_API_KEY" \
        "$base_url/api/admin/resume-ingestion" 2>/dev/null || echo "000")

    if [ "$response" = "200" ]; then
        log_info "Ingestion resumed"
    else
        log_warn "Resume API returned HTTP $response — manually restart the app if ingestion remains paused"
    fi
}

# Main deployment flow
main() {
    show_deployment_info
    check_connection
    confirm_deployment
    validate_frontend_target
    
    # [OPS-1] Pause ingestion during deploy window
    pause_ingestion

    # Create backup before any destructive rsync --delete operations
    create_backup

    # Gate deploy on local smoke test — catches regressions before push
    run_smoke_test

    deploy_backend
    deploy_frontend
    verify_remote_static_files_path
    post_deploy
    restart_app

    # [OPS-1] Resume ingestion after restart
    resume_ingestion

    echo ""
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║          ✓ Deployment Complete!                           ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo ""
    echo "  Storm Scout: https://$SERVER_HOST"
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

# Handle errors — resume ingestion before exiting so a failed deploy does not
# leave the scheduler permanently stopped on the production server.
trap 'log_error "Deployment failed!"; resume_ingestion; exit 1' ERR

# Run deployment
main
