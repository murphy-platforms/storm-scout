#!/bin/bash
# Storm Scout - SSH-Based Production Testing Script
# Run comprehensive tests on production environment via SSH
# Date: 2026-02-14

set -e

SSH_HOST="${DEPLOY_USER}@${DEPLOY_HOST}"
SSH_PORT="${DEPLOY_PORT:-22}"
API_BASE="https://${DEPLOY_HOST}/api"

echo "=================================="
echo "Storm Scout Production Test Suite"
echo "=================================="
echo "Date: $(date)"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

pass() { echo -e "${GREEN}✓${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }

# Test 1: SSH Connectivity
echo "Test 1: SSH Connectivity"
if ssh -p $SSH_PORT $SSH_HOST "echo 'SSH OK'" > /dev/null 2>&1; then
    pass "SSH connection successful"
else
    fail "SSH connection failed"
    exit 1
fi
echo ""

# Test 2: Node.js Environment
echo "Test 2: Node.js Environment"
NODE_VERSION=$(ssh -p $SSH_PORT $SSH_HOST "source ~/nodevenv/storm-scout/20/bin/activate && node --version")
if [[ $NODE_VERSION == v20* ]]; then
    pass "Node.js $NODE_VERSION (expected v20.x)"
else
    fail "Node.js version mismatch: $NODE_VERSION"
fi
echo ""

# Test 3: Application Files
echo "Test 3: Application Files Present"
ssh -p $SSH_PORT $SSH_HOST "cd storm-scout && ls -1" | while read file; do
    if [[ "$file" == "src" ]] || [[ "$file" == "package.json" ]] || [[ "$file" == ".env" ]]; then
        pass "Found: $file"
    fi
done
echo ""

# Test 4: Environment Configuration
echo "Test 4: Environment Configuration"
ENV_CHECK=$(ssh -p $SSH_PORT $SSH_HOST "cd storm-scout && grep -c NODE_ENV .env || echo 0")
if [[ $ENV_CHECK -gt 0 ]]; then
    pass ".env file configured"
else
    warn ".env may be missing NODE_ENV"
fi
echo ""

# Test 5: Last Ingestion Status
echo "Test 5: Last Ingestion Status"
LAST_INGESTION=$(ssh -p $SSH_PORT $SSH_HOST "cat storm-scout/.last-ingestion.json 2>/dev/null || echo '{}'")
LAST_TIME=$(echo $LAST_INGESTION | jq -r '.lastUpdated // "never"')
if [[ "$LAST_TIME" != "never" ]]; then
    pass "Last ingestion: $LAST_TIME"
    
    # Check if stale (>20 minutes)
    LAST_TIMESTAMP=$(date -j -f "%Y-%m-%dT%H:%M:%S" "${LAST_TIME:0:19}" "+%s" 2>/dev/null || echo 0)
    NOW_TIMESTAMP=$(date +%s)
    AGE_MINUTES=$(( ($NOW_TIMESTAMP - $LAST_TIMESTAMP) / 60 ))
    
    if [[ $AGE_MINUTES -gt 20 ]]; then
        warn "Data is stale (${AGE_MINUTES} minutes old, expected <20min)"
    else
        pass "Data is fresh (${AGE_MINUTES} minutes old)"
    fi
else
    fail "No ingestion data found"
fi
echo ""

# Test 6: Error Logs
echo "Test 6: Error Logs Analysis"
ERROR_COUNT=$(ssh -p $SSH_PORT $SSH_HOST "cd storm-scout && wc -l < stderr.log")
if [[ $ERROR_COUNT -lt 10 ]]; then
    pass "stderr.log has $ERROR_COUNT lines (minimal errors)"
elif [[ $ERROR_COUNT -lt 100 ]]; then
    warn "stderr.log has $ERROR_COUNT lines (moderate)"
else
    fail "stderr.log has $ERROR_COUNT lines (excessive errors)"
fi

# Check for specific error patterns
echo "  Checking for critical errors..."
ssh -p $SSH_PORT $SSH_HOST "cd storm-scout && tail -50 stderr.log" | grep -i "error\|exception\|failed" > /tmp/errors.txt || true
if [[ -s /tmp/errors.txt ]]; then
    warn "Found error patterns in logs:"
    head -5 /tmp/errors.txt | sed 's/^/    /'
else
    pass "No critical error patterns in recent logs"
fi
echo ""

# Test 7: API Endpoint Health
echo "Test 7: API Endpoint Health"
for endpoint in "status/overview" "advisories/active" "sites"; do
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" $API_BASE/$endpoint)
    TIME=$(curl -s -o /dev/null -w "%{time_total}" $API_BASE/$endpoint)
    
    if [[ $STATUS == "200" ]]; then
        if (( $(echo "$TIME < 1.0" | bc -l) )); then
            pass "/$endpoint: $STATUS (${TIME}s)"
        else
            warn "/$endpoint: $STATUS (${TIME}s - slow)"
        fi
    else
        fail "/$endpoint: $STATUS"
    fi
done
echo ""

# Test 8: Data Validation via API
echo "Test 8: Data Validation (via API)"
OVERVIEW=$(curl -s $API_BASE/status/overview)

TOTAL_SITES=$(echo $OVERVIEW | jq '.data.total_sites')
if [[ $TOTAL_SITES == "219" ]]; then
    pass "Total sites: $TOTAL_SITES"
else
    fail "Total sites: $TOTAL_SITES (expected 219)"
fi

SITES_WITH_ADV=$(echo $OVERVIEW | jq '.data.sites_with_advisories')
pass "Sites with advisories: $SITES_WITH_ADV"

TOTAL_ADV=$(echo $OVERVIEW | jq '.data.total_active_advisories')
pass "Total active advisories: $TOTAL_ADV"
echo ""

# Test 9: Severity Validation
echo "Test 9: Severity Data Quality"
ADVISORIES=$(curl -s $API_BASE/advisories/active)
UNKNOWN_COUNT=$(echo $ADVISORIES | jq '[.data[] | select(.severity == "Unknown")] | length')

if [[ $UNKNOWN_COUNT == "0" ]]; then
    pass "No advisories with 'Unknown' severity"
else
    fail "Found $UNKNOWN_COUNT advisories with 'Unknown' severity"
    echo $ADVISORIES | jq '[.data[] | select(.severity == "Unknown")] | .[0] | {site_code, advisory_type, severity}' | sed 's/^/    /'
fi
echo ""

# Test 10: Multi-Zone Analysis
echo "Test 10: Multi-Zone Advisory Analysis"
MULTI_ZONE_SITES=$(echo $ADVISORIES | jq '[.data | group_by(.site_code) | .[] | select(length > 1)] | length')
if [[ $MULTI_ZONE_SITES -gt 0 ]]; then
    warn "$MULTI_ZONE_SITES sites have multiple advisories (multi-zone coverage)"
    echo "    Example:"
    echo $ADVISORIES | jq '[.data | group_by(.site_code) | .[] | select(length > 1)] | .[0] | {site_code: .[0].site_code, count: length, types: [.[].advisory_type] | unique}' | sed 's/^/    /'
else
    pass "No multi-zone advisory scenarios currently"
fi
echo ""

# Test 11: Process Status (if accessible)
echo "Test 11: Application Process Status"
PROC_CHECK=$(ssh -p $SSH_PORT $SSH_HOST "ps aux | grep -c 'node.*server.js' || echo 0")
if [[ $PROC_CHECK -gt 0 ]]; then
    pass "Node.js process running"
else
    warn "Cannot confirm Node.js process (may be managed by Passenger)"
fi
echo ""

# Test 12: Disk Space
echo "Test 12: Disk Space"
DISK_USAGE=$(ssh -p $SSH_PORT $SSH_HOST "df -h ~ | tail -1 | awk '{print \$5}' | sed 's/%//'")
if [[ $DISK_USAGE -lt 80 ]]; then
    pass "Disk usage: ${DISK_USAGE}%"
elif [[ $DISK_USAGE -lt 90 ]]; then
    warn "Disk usage: ${DISK_USAGE}% (approaching limit)"
else
    fail "Disk usage: ${DISK_USAGE}% (critical)"
fi
echo ""

# Summary
echo "=================================="
echo "Test Summary"
echo "=================================="
echo "Run at: $(date)"
echo ""
echo "Key Findings:"
echo "- Total Sites: $TOTAL_SITES"
echo "- Active Advisories: $TOTAL_ADV"
echo "- Sites Impacted: $SITES_WITH_ADV"
echo "- Unknown Severity Count: $UNKNOWN_COUNT"
echo "- Multi-Zone Sites: $MULTI_ZONE_SITES"
echo "- Last Ingestion: $LAST_TIME"
echo ""

if [[ $UNKNOWN_COUNT -gt 0 ]]; then
    echo -e "${RED}⚠ ACTION REQUIRED: Fix 'Unknown' severity advisories${NC}"
fi

echo ""
echo "For detailed analysis, see: QA-REVIEW-LIVE-FINDINGS.md"
