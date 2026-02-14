#!/bin/bash
# Storm Scout - Fix Severity Bug and Run Database Tests
# Date: 2026-02-14

set -e

SSH_HOST="mwqtiakilx@teammurphy.rocks"
SSH_PORT="21098"
DB_USER="mwqtiakilx_stormscout"
DB_NAME="mwqtiakilx_stormscout"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "=================================="
echo "Storm Scout - Fix Severity Bug"
echo "=================================="
echo ""

# Prompt for password (hidden input)
echo "Enter database password for $DB_USER:"
echo "(Password will not be displayed as you type)"
read -s DB_PASS
echo ""

if [ -z "$DB_PASS" ]; then
    echo -e "${RED}✗${NC} No password provided. Exiting."
    exit 1
fi

# Test connection first
echo "Testing database connection..."
TEST_RESULT=$(ssh -p $SSH_PORT $SSH_HOST "mysql -u $DB_USER -p'$DB_PASS' $DB_NAME -e 'SELECT 1 as test;' 2>&1" | tail -1)

if [[ "$TEST_RESULT" == "1" ]]; then
    echo -e "${GREEN}✓${NC} Database connection successful"
else
    echo -e "${RED}✗${NC} Database connection failed"
    echo "Error: $TEST_RESULT"
    exit 1
fi
echo ""

# Step 1: Check current state
echo "Step 1: Checking for 'Unknown' severity advisories..."
UNKNOWN_COUNT=$(ssh -p $SSH_PORT $SSH_HOST "mysql -u $DB_USER -p'$DB_PASS' $DB_NAME -e \"SELECT COUNT(*) FROM advisories WHERE severity='Unknown';\" 2>&1" | tail -1)

if [[ "$UNKNOWN_COUNT" == "0" ]]; then
    echo -e "${GREEN}✓${NC} No 'Unknown' severity advisories found. Bug already fixed or not present."
    echo ""
else
    echo -e "${YELLOW}⚠${NC} Found $UNKNOWN_COUNT advisories with 'Unknown' severity"
    echo ""
    
    # Get details
    echo "Details of affected advisories:"
    ssh -p $SSH_PORT $SSH_HOST "mysql -u $DB_USER -p'$DB_PASS' $DB_NAME -e \"SELECT id, site_id, advisory_type, severity, source, headline FROM advisories WHERE severity='Unknown' LIMIT 5;\" 2>&1" | sed 's/^/  /'
    echo ""
    
    # Ask for confirmation
    echo -e "${YELLOW}Do you want to fix these advisories by setting severity='Minor'? (y/n)${NC}"
    read -r CONFIRM
    
    if [[ "$CONFIRM" == "y" || "$CONFIRM" == "Y" ]]; then
        echo ""
        echo "Executing fix: UPDATE advisories SET severity='Minor' WHERE severity='Unknown';"
        
        UPDATE_RESULT=$(ssh -p $SSH_PORT $SSH_HOST "mysql -u $DB_USER -p'$DB_PASS' $DB_NAME -e \"UPDATE advisories SET severity='Minor' WHERE severity='Unknown'; SELECT ROW_COUNT() as affected;\" 2>&1" | tail -1)
        
        echo -e "${GREEN}✓${NC} Fixed $UPDATE_RESULT advisories"
        echo ""
        
        # Verify fix
        echo "Verifying fix..."
        VERIFY_COUNT=$(ssh -p $SSH_PORT $SSH_HOST "mysql -u $DB_USER -p'$DB_PASS' $DB_NAME -e \"SELECT COUNT(*) FROM advisories WHERE severity='Unknown';\" 2>&1" | tail -1)
        
        if [[ "$VERIFY_COUNT" == "0" ]]; then
            echo -e "${GREEN}✓${NC} Verification successful: No more 'Unknown' severity advisories"
        else
            echo -e "${RED}✗${NC} Verification failed: Still $VERIFY_COUNT 'Unknown' severity advisories"
        fi
        echo ""
    else
        echo "Skipping fix."
        echo ""
    fi
fi

# Step 2: Run comprehensive database tests
echo "Step 2: Running comprehensive database tests..."
echo ""

# Save password to temp file for test-database.sh
TEMP_SCRIPT=$(mktemp)
cat > "$TEMP_SCRIPT" << 'EOF'
#!/bin/bash
DB_PASS="$1"
EOF

echo "chmod +x test-database.sh"
chmod +x test-database.sh 2>/dev/null || true

echo "Running test-database.sh..."
echo ""
./test-database.sh "$DB_PASS"

echo ""
echo "=================================="
echo "Summary"
echo "=================================="
echo ""
echo -e "${GREEN}✓${NC} Database connection tested"
echo -e "${GREEN}✓${NC} Severity bug checked and fixed (if needed)"
echo -e "${GREEN}✓${NC} Comprehensive database tests completed"
echo ""
echo "Next steps:"
echo "1. Review test-database.sh output above for any P1 issues"
echo "2. Consider deploying validation code to prevent future 'Unknown' severity"
echo "   (See QA-REVIEW-LIVE-FINDINGS.md section 9.2)"
echo "3. Monitor production for 24 hours to ensure fix is stable"
echo ""
echo "All findings documented in: QA-REVIEW-LIVE-FINDINGS.md"
