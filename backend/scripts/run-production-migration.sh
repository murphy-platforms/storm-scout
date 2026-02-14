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
if [ -f .env ]; then
    source .env
else
    echo -e "${RED}Error: .env file not found${NC}"
    echo "Please create .env file with database credentials"
    exit 1
fi

# Validate required environment variables
if [ -z "$DB_HOST" ] || [ -z "$DB_USER" ] || [ -z "$DB_PASSWORD" ] || [ -z "$DB_NAME" ]; then
    echo -e "${RED}Error: Missing database credentials in .env${NC}"
    echo "Required: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME"
    exit 1
fi

echo -e "${YELLOW}Database: $DB_NAME @ $DB_HOST${NC}"
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
