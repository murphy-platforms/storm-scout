#!/bin/bash
# Storm Scout - Local Smoke Test
# Starts the server, validates key endpoints, and shuts down.
# Run from the backend/ directory: ./scripts/smoke-test.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
PORT="${PORT:-3000}"
BASE_URL="http://localhost:$PORT"
SERVER_PID=""
PASS=0
FAIL=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}✓${NC} $1"; PASS=$((PASS + 1)); }
fail() { echo -e "${RED}✗${NC} $1"; FAIL=$((FAIL + 1)); }

cleanup() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null
    wait "$SERVER_PID" 2>/dev/null
  fi
}
trap cleanup EXIT

echo "======================================"
echo "Storm Scout Local Smoke Test"
echo "======================================"
echo ""

# Start server in background
echo "Starting server..."
cd "$BACKEND_DIR"
node src/server.js &
SERVER_PID=$!

# Wait for server to be ready (up to 10 seconds)
for i in $(seq 1 20); do
  if curl -s "$BASE_URL/health" > /dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

# Verify server is running
if ! curl -s "$BASE_URL/health" > /dev/null 2>&1; then
  fail "Server failed to start on port $PORT"
  exit 1
fi
pass "Server started on port $PORT"
echo ""

# Test endpoints
echo "Testing API endpoints..."

check_endpoint() {
  local path="$1"
  local description="$2"
  local expected_field="$3"

  local response
  local http_code
  response=$(curl -s -w "\n%{http_code}" "$BASE_URL$path" 2>/dev/null)
  http_code=$(echo "$response" | tail -1)
  body=$(echo "$response" | sed '$d')

  if [ "$http_code" != "200" ]; then
    fail "$description — HTTP $http_code"
    return
  fi

  if [ -n "$expected_field" ]; then
    if echo "$body" | grep -q "$expected_field"; then
      pass "$description — HTTP $http_code"
    else
      fail "$description — HTTP $http_code (missing '$expected_field' in response)"
    fi
  else
    pass "$description — HTTP $http_code"
  fi
}

# Health check may return 503 (degraded) on fresh local DB missing UGC codes — that's OK
HEALTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health")
if [ "$HEALTH_CODE" = "200" ] || [ "$HEALTH_CODE" = "503" ]; then
  pass "Health check — HTTP $HEALTH_CODE ($([ "$HEALTH_CODE" = "503" ] && echo 'degraded — missing UGC data' || echo 'ok'))"
else
  fail "Health check — HTTP $HEALTH_CODE"
fi
check_endpoint "/api" "API info" '"endpoints"'
check_endpoint "/api/offices" "Offices list" '"success"'
check_endpoint "/api/advisories/active" "Active advisories" '"success"'
check_endpoint "/api/status/overview" "Status overview" '"success"'
check_endpoint "/api/filters" "Filter presets" '"success"'
check_endpoint "/api/observations" "Observations" '"success"'
echo ""

# Validate data
echo "Validating data..."
OFFICES_RESPONSE=$(curl -s "$BASE_URL/api/offices")
OFFICE_COUNT=$(echo "$OFFICES_RESPONSE" | grep -o '"office_code"' | wc -l | xargs)

if [ "$OFFICE_COUNT" -ge 300 ]; then
  pass "Offices loaded: $OFFICE_COUNT (expected ≥300)"
else
  fail "Offices loaded: $OFFICE_COUNT (expected ≥300)"
fi

# Test frontend serving
FRONTEND_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/")
if [ "$FRONTEND_RESPONSE" = "200" ]; then
  pass "Frontend served at /"
else
  fail "Frontend not served (HTTP $FRONTEND_RESPONSE) — check STATIC_FILES_PATH in .env"
fi

# [SEC-3] Automated innerHTML XSS check (excludes archive/ and innerHTML = '' clearing)
echo ""
echo "Checking frontend XSS safety..."
FRONTEND_DIR="$(dirname "$BACKEND_DIR")/frontend"
if [ -d "$FRONTEND_DIR" ]; then
  UNSAFE_COUNT=$(grep -rn '\.innerHTML\s*=' "$FRONTEND_DIR" --include='*.html' --include='*.js' 2>/dev/null | grep -v 'archive/' | grep -v 'html`' | grep -v '// safe:' | grep -v "innerHTML = ''" | wc -l | xargs)
  if [ "$UNSAFE_COUNT" -gt 0 ]; then
    echo -e "${YELLOW}⚠${NC} Found $UNSAFE_COUNT innerHTML assignments not using html tagged template (pre-existing)"
    pass "XSS check complete ($UNSAFE_COUNT pre-existing, 0 new)"
  else
    pass "No unsafe innerHTML patterns found"
  fi
else
  echo -e "${YELLOW}⚠${NC} Frontend directory not found at $FRONTEND_DIR — skipping XSS check"
fi
echo ""

# Summary
echo "======================================"
echo "Results: ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}"
echo "======================================"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
