#!/bin/bash
# Storm Scout - Database Validation Script
# Requires database password from Keychain or manual input
# Date: 2026-02-14

set -e

SSH_HOST="mwqtiakilx@teammurphy.rocks"
SSH_PORT="21098"
DB_USER="mwqtiakilx_stormsc"
DB_NAME="mwqtiakilx_stormscout"

echo "=================================="
echo "Storm Scout Database Test Suite"
echo "=================================="
echo ""

# Check if password is provided as argument
if [ -z "$1" ]; then
    echo "Usage: $0 <database_password>"
    echo ""
    echo "To retrieve password from Keychain, try:"
    echo "  security find-generic-password -s 'stormscout_db' -w"
    echo ""
    echo "Or run manually with:"
    echo "  ./test-database.sh \$(security find-generic-password -s 'YOUR_KEYCHAIN_ENTRY' -w)"
    exit 1
fi

DB_PASS="$1"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

pass() { echo -e "${GREEN}✓${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
info() { echo -e "${BLUE}ℹ${NC} $1"; }

# Function to run SQL query via SSH
run_query() {
    local query="$1"
    ssh -p $SSH_PORT $SSH_HOST "mysql -u $DB_USER -p'$DB_PASS' $DB_NAME -e \"$query\" 2>&1"
}

# Test 1: Database Connection
echo "Test 1: Database Connection"
RESULT=$(run_query "SELECT 1 as test;" 2>&1)
if echo "$RESULT" | grep -q "test"; then
    pass "Database connection successful"
else
    fail "Database connection failed: $RESULT"
    exit 1
fi
echo ""

# Test 2: Table Structure Validation
echo "Test 2: Table Structure Validation"
TABLES=$(run_query "SHOW TABLES;" | tail -n +2)
EXPECTED_TABLES=("advisories" "advisory_history" "notices" "sites" "site_status")

for table in "${EXPECTED_TABLES[@]}"; do
    if echo "$TABLES" | grep -q "^$table$"; then
        pass "Table exists: $table"
    else
        fail "Table missing: $table"
    fi
done
echo ""

# Test 3: Data Counts
echo "Test 3: Data Counts"

SITES_COUNT=$(run_query "SELECT COUNT(*) FROM sites;" | tail -1)
if [[ $SITES_COUNT == "219" ]]; then
    pass "Sites table: $SITES_COUNT records (expected 219)"
else
    fail "Sites table: $SITES_COUNT records (expected 219)"
fi

ADVISORIES_COUNT=$(run_query "SELECT COUNT(*) FROM advisories WHERE status='active';" | tail -1)
info "Active advisories: $ADVISORIES_COUNT"

HISTORY_COUNT=$(run_query "SELECT COUNT(*) FROM advisory_history;" | tail -1)
if [[ $HISTORY_COUNT == "0" ]]; then
    warn "Advisory history: $HISTORY_COUNT records (feature not yet implemented)"
else
    pass "Advisory history: $HISTORY_COUNT records"
fi
echo ""

# Test 4: Severity Validation
echo "Test 4: Severity Data Quality"
SEVERITY_DIST=$(run_query "SELECT severity, COUNT(*) as count FROM advisories WHERE status='active' GROUP BY severity ORDER BY count DESC;")
echo "$SEVERITY_DIST" | sed 's/^/  /'

UNKNOWN_COUNT=$(run_query "SELECT COUNT(*) FROM advisories WHERE status='active' AND severity='Unknown';" | tail -1)
if [[ $UNKNOWN_COUNT == "0" ]]; then
    pass "No 'Unknown' severity records"
else
    fail "Found $UNKNOWN_COUNT advisories with 'Unknown' severity"
    
    # Get details
    echo "  Details:"
    run_query "SELECT id, site_id, advisory_type, severity, source FROM advisories WHERE severity='Unknown' LIMIT 3;" | sed 's/^/    /'
fi
echo ""

# Test 5: VTEC Data Validation
echo "Test 5: VTEC Data Validation"
NULL_VTEC=$(run_query "SELECT COUNT(*) FROM advisories WHERE status='active' AND vtec_action IS NULL;" | tail -1)
if [[ $NULL_VTEC -gt 0 ]]; then
    warn "$NULL_VTEC active advisories have NULL vtec_action"
else
    pass "All active advisories have vtec_action"
fi

NULL_VTEC_EVENT=$(run_query "SELECT COUNT(*) FROM advisories WHERE status='active' AND vtec_event_id IS NULL;" | tail -1)
if [[ $NULL_VTEC_EVENT -gt 0 ]]; then
    warn "$NULL_VTEC_EVENT active advisories have NULL vtec_event_id"
else
    pass "All active advisories have vtec_event_id"
fi
echo ""

# Test 6: Duplicate Detection
echo "Test 6: Duplicate Detection"
EXTERNAL_ID_DUPES=$(run_query "SELECT external_id, COUNT(*) as count FROM advisories WHERE status='active' GROUP BY external_id HAVING count > 1;" | tail -n +2)
if [ -z "$EXTERNAL_ID_DUPES" ]; then
    pass "No duplicate external_id values"
else
    fail "Found duplicate external_id values:"
    echo "$EXTERNAL_ID_DUPES" | sed 's/^/  /'
fi

VTEC_EVENT_DUPES=$(run_query "SELECT vtec_event_id, advisory_type, COUNT(*) as count FROM advisories WHERE status='active' AND vtec_event_id IS NOT NULL GROUP BY vtec_event_id, advisory_type HAVING count > 1 LIMIT 5;" | tail -n +2)
if [ -z "$VTEC_EVENT_DUPES" ]; then
    info "No duplicate vtec_event_id + advisory_type combinations (multi-zone alerts may still exist)"
else
    warn "Multi-zone alerts detected (same vtec_event_id, different zones):"
    echo "$VTEC_EVENT_DUPES" | sed 's/^/  /'
fi
echo ""

# Test 7: Timestamp Validation
echo "Test 7: Timestamp Validation"
FUTURE_ADVISORIES=$(run_query "SELECT COUNT(*) FROM advisories WHERE status='active' AND start_time > NOW();" | tail -1)
if [[ $FUTURE_ADVISORIES == "0" ]]; then
    pass "No advisories with future start_time"
else
    warn "$FUTURE_ADVISORIES advisories have future start_time (may be intentional)"
fi

EXPIRED_ADVISORIES=$(run_query "SELECT COUNT(*) FROM advisories WHERE status='active' AND expires < NOW();" | tail -1)
if [[ $EXPIRED_ADVISORIES == "0" ]]; then
    pass "No expired advisories in 'active' status"
else
    fail "$EXPIRED_ADVISORIES expired advisories still marked as 'active' (cleanup needed)"
fi
echo ""

# Test 8: Site Status Validation
echo "Test 8: Site Status Validation"
STATUS_DIST=$(run_query "SELECT operational_status, COUNT(*) as count FROM site_status GROUP BY operational_status;")
echo "$STATUS_DIST" | sed 's/^/  /'

NULL_STATUS=$(run_query "SELECT COUNT(*) FROM site_status WHERE operational_status IS NULL;" | tail -1)
if [[ $NULL_STATUS == "0" ]]; then
    pass "All sites have operational_status"
else
    warn "$NULL_STATUS sites have NULL operational_status"
fi
echo ""

# Test 9: Index Analysis
echo "Test 9: Index Analysis"
INDEXES=$(run_query "SHOW INDEXES FROM advisories WHERE Key_name != 'PRIMARY';" | tail -n +2 | awk '{print $3}' | sort -u)
if [ -z "$INDEXES" ]; then
    warn "No secondary indexes found on advisories table"
    echo "  Recommendation: Add indexes for common queries:"
    echo "    CREATE INDEX idx_advisories_status_severity ON advisories(status, severity);"
    echo "    CREATE INDEX idx_advisories_site_id ON advisories(site_id);"
else
    pass "Secondary indexes found:"
    echo "$INDEXES" | sed 's/^/    /'
fi
echo ""

# Test 10: Foreign Key Constraints
echo "Test 10: Foreign Key Constraints"
FK_COUNT=$(run_query "SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA='$DB_NAME' AND CONSTRAINT_TYPE='FOREIGN KEY';" | tail -1)
if [[ $FK_COUNT == "0" ]]; then
    warn "No foreign key constraints found"
    echo "  Recommendation: Add FK constraints to ensure referential integrity"
else
    pass "Found $FK_COUNT foreign key constraints"
    run_query "SELECT TABLE_NAME, CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA='$DB_NAME' AND CONSTRAINT_TYPE='FOREIGN KEY';" | tail -n +2 | sed 's/^/  /'
fi
echo ""

# Test 11: Orphaned Records
echo "Test 11: Orphaned Records Check"
ORPHANED_ADV=$(run_query "SELECT COUNT(*) FROM advisories a LEFT JOIN sites s ON a.site_id = s.id WHERE s.id IS NULL;" | tail -1)
if [[ $ORPHANED_ADV == "0" ]]; then
    pass "No orphaned advisories (all reference valid sites)"
else
    fail "$ORPHANED_ADV advisories reference non-existent sites"
fi
echo ""

# Test 12: Query Performance Sample
echo "Test 12: Query Performance Sample"
echo "  Testing common query: SELECT * FROM advisories WHERE status='active' AND severity='Extreme'"
START_TIME=$(date +%s%N)
run_query "SELECT COUNT(*) FROM advisories WHERE status='active' AND severity='Extreme';" > /dev/null
END_TIME=$(date +%s%N)
QUERY_MS=$(( ($END_TIME - $START_TIME) / 1000000 ))

if [[ $QUERY_MS -lt 100 ]]; then
    pass "Query executed in ${QUERY_MS}ms (fast)"
elif [[ $QUERY_MS -lt 500 ]]; then
    info "Query executed in ${QUERY_MS}ms (acceptable)"
else
    warn "Query executed in ${QUERY_MS}ms (slow - consider indexes)"
fi
echo ""

# Summary
echo "=================================="
echo "Database Test Summary"
echo "=================================="
echo ""
echo "Data Integrity:"
echo "  - Sites: $SITES_COUNT"
echo "  - Active Advisories: $ADVISORIES_COUNT"
echo "  - Advisory History: $HISTORY_COUNT"
echo "  - Unknown Severity: $UNKNOWN_COUNT"
echo "  - Expired (still active): $EXPIRED_ADVISORIES"
echo "  - Orphaned Records: $ORPHANED_ADV"
echo ""
echo "Performance:"
echo "  - Secondary Indexes: $([ -z "$INDEXES" ] && echo "0" || echo "$INDEXES" | wc -l | xargs)"
echo "  - Foreign Keys: $FK_COUNT"
echo "  - Sample Query: ${QUERY_MS}ms"
echo ""

if [[ $UNKNOWN_COUNT -gt 0 ]] || [[ $EXPIRED_ADVISORIES -gt 0 ]] || [[ $ORPHANED_ADV -gt 0 ]]; then
    echo -e "${RED}⚠ ACTION REQUIRED: Data integrity issues detected${NC}"
    echo ""
    echo "Recommended fixes:"
    [ $UNKNOWN_COUNT -gt 0 ] && echo "  1. Fix 'Unknown' severity: UPDATE advisories SET severity='Minor' WHERE severity='Unknown';"
    [ $EXPIRED_ADVISORIES -gt 0 ] && echo "  2. Clean up expired: UPDATE advisories SET status='expired' WHERE status='active' AND expires < NOW();"
    [ $ORPHANED_ADV -gt 0 ] && echo "  3. Remove orphaned: DELETE FROM advisories WHERE site_id NOT IN (SELECT id FROM sites);"
fi

echo ""
echo "For full context, see: QA-REVIEW-LIVE-FINDINGS.md"
