#!/bin/bash
# Run Production Migration for Operational Status
# Usage: ./scripts/run-production-migration.sh
# Co-Authored-By: Warp <agent@warp.dev>

set -e

echo "=========================================="
echo "Storm Scout - Production Migration"
echo "Operational Status: Legacy to 4-Category"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get database credentials
echo -e "${YELLOW}Enter database credentials:${NC}"
echo ""

# Check for .env.production first, then .env
if [ -f .env.production ]; then
    DB_HOST=$(grep '^DB_HOST=' .env.production | cut -d '=' -f2)
    DB_USER=$(grep '^DB_USER=' .env.production | cut -d '=' -f2)
    DB_NAME=$(grep '^DB_NAME=' .env.production | cut -d '=' -f2)
    echo -e "Using credentials from .env.production"
fi

# Prompt for host (with default)
read -p "Database host [${DB_HOST:-localhost}]: " input_host
DB_HOST=${input_host:-${DB_HOST:-localhost}}

# Prompt for user (with default)
read -p "Database user [${DB_USER:-root}]: " input_user
DB_USER=${input_user:-${DB_USER:-root}}

# Prompt for database name (with default)
read -p "Database name [${DB_NAME:-storm_scout}]: " input_name
DB_NAME=${input_name:-${DB_NAME:-storm_scout}}

# Prompt for password (no echo)
read -s -p "Database password: " DB_PASSWORD
echo ""
echo ""

if [ -z "$DB_PASSWORD" ]; then
    echo -e "${RED}Error: Password cannot be empty${NC}"
    exit 1
fi

echo -e "${GREEN}Connecting to: $DB_NAME @ $DB_HOST as $DB_USER${NC}"
echo ""

# Confirm before proceeding
read -p "This will update operational status values in PRODUCTION. Continue? (yes/no) " -r
echo
if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    echo "Migration cancelled"
    exit 0
fi

# Run the migration
echo -e "${GREEN}Running migration...${NC}"
echo ""

mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < src/data/migrations/20260214-migrate-operational-status-production.sql

echo ""
echo -e "${GREEN}✓ Migration complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Verify the 'AFTER MIGRATION' counts look correct"
echo "2. Restart the backend: touch ~/storm-scout/tmp/restart.txt (on production server)"
echo "3. Test both Classic and Beta UIs to confirm operational status displays correctly"
echo ""
