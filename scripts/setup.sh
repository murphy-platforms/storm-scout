#!/usr/bin/env bash
# Storm Scout — one-command local development setup
# Usage: bash scripts/setup.sh
#
# Prerequisites: Node.js 18+, Docker, npm, git

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

info()  { printf "${GREEN}[setup]${NC} %s\n" "$1"; }
warn()  { printf "${YELLOW}[setup]${NC} %s\n" "$1"; }
error() { printf "${RED}[setup]${NC} %s\n" "$1"; }

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

# ── 1. Check prerequisites ──────────────────────────────────────────
info "Checking prerequisites..."

missing=()
command -v node  >/dev/null 2>&1 || missing+=("node")
command -v npm   >/dev/null 2>&1 || missing+=("npm")
command -v docker >/dev/null 2>&1 || missing+=("docker")

if [ ${#missing[@]} -gt 0 ]; then
    error "Missing required tools: ${missing[*]}"
    echo "  Install Node.js 18+: https://nodejs.org"
    echo "  Install Docker:      https://docs.docker.com/get-docker/"
    exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    error "Node.js 18+ required (found v$(node -v))"
    exit 1
fi

# ── 2. Start database ───────────────────────────────────────────────
info "Starting MariaDB via Docker Compose..."

if docker ps --format '{{.Names}}' | grep -q '^storm-scout-db$'; then
    info "Database container already running."
else
    docker compose up -d
    info "Waiting for database to be healthy..."
    timeout=60
    while [ $timeout -gt 0 ]; do
        if docker inspect --format='{{.State.Health.Status}}' storm-scout-db 2>/dev/null | grep -q healthy; then
            break
        fi
        sleep 2
        timeout=$((timeout - 2))
    done
    if [ $timeout -le 0 ]; then
        error "Database failed to become healthy within 60s"
        exit 1
    fi
    info "Database is healthy."
fi

# ── 3. Install dependencies ─────────────────────────────────────────
info "Installing backend dependencies..."
cd "$ROOT_DIR/backend"
npm install

# ── 4. Configure environment ────────────────────────────────────────
if [ ! -f .env ]; then
    info "Creating .env from template..."
    cp .env.example .env
    # Set defaults matching docker-compose.yml
    sed -i.bak 's/DB_USER=your_db_user/DB_USER=your_db_user/' .env
    sed -i.bak 's/DB_PASSWORD=your_password_here/DB_PASSWORD=localdev/' .env
    sed -i.bak 's/DB_NAME=your_db_name/DB_NAME=storm_scout_dev/' .env
    rm -f .env.bak
    warn "Created .env — edit NOAA_API_USER_AGENT with your email before ingesting data."
else
    info ".env already exists, skipping."
fi

# ── 5. Initialize and seed database ─────────────────────────────────
info "Initializing database schema..."
npm run init-db

info "Seeding 300 demo office locations..."
npm run seed-db

# ── 6. Done ──────────────────────────────────────────────────────────
echo ""
info "Setup complete!"
echo ""
echo "  Start the server:  cd backend && npm run dev"
echo "  Open dashboard:    http://localhost:3000"
echo ""
echo "  NOAA data will start ingesting every 15 minutes."
echo "  To trigger an immediate ingestion:  npm run ingest"
echo ""
warn "Remember to set NOAA_API_USER_AGENT in backend/.env to your email address."
