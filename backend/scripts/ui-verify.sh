#!/bin/bash
# Storm Scout — UI Verification Test
# Verifies all frontend pages are served and their API dependencies return valid data.
# Run from the backend/ directory with the server already running:
#   bash scripts/ui-verify.sh

PORT="${PORT:-3000}"
BASE="http://localhost:$PORT"
PASS=0
FAIL=0

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

pass() { echo -e "${GREEN}✓${NC} $1"; PASS=$((PASS + 1)); }
fail() { echo -e "${RED}✗${NC} $1"; FAIL=$((FAIL + 1)); }

# --- helper: check page HTML for HTTP 200 and a key DOM element ID ---
check_page() {
  local path="$1"
  local label="$2"
  local element_id="$3"

  local body http_code
  body=$(curl -s -w "\n%{http_code}" "$BASE/$path" 2>/dev/null)
  http_code=$(echo "$body" | tail -1)
  body=$(echo "$body" | sed '$d')

  if [ "$http_code" != "200" ]; then
    fail "$label — HTTP $http_code"
    return
  fi

  if [ -n "$element_id" ]; then
    if echo "$body" | grep -q "id=\"$element_id\""; then
      pass "$label — HTTP 200, found #$element_id"
    else
      fail "$label — HTTP 200 but missing #$element_id"
    fi
  else
    pass "$label — HTTP 200"
  fi
}

# --- helper: check API endpoint for 200 + "success":true + optional field ---
check_api() {
  local path="$1"
  local label="$2"
  local expected_field="$3"

  local body http_code
  body=$(curl -s -w "\n%{http_code}" "$BASE$path" 2>/dev/null)
  http_code=$(echo "$body" | tail -1)
  body=$(echo "$body" | sed '$d')

  if [ "$http_code" != "200" ]; then
    fail "$label — HTTP $http_code"
    return
  fi

  if ! echo "$body" | grep -q '"success":true'; then
    fail "$label — HTTP 200 but missing success:true"
    return
  fi

  if [ -n "$expected_field" ]; then
    if echo "$body" | grep -q "$expected_field"; then
      pass "$label — OK"
    else
      fail "$label — OK but missing '$expected_field'"
    fi
  else
    pass "$label — OK"
  fi
}

echo "======================================"
echo "Storm Scout UI Verification"
echo "======================================"
echo ""

# ---- 1. Frontend Pages ----
echo "--- Frontend Pages ---"
check_page "index.html"                         "index.html (Dashboard)"      "totalSites"
check_page "advisories.html"                     "advisories.html"             "cardViewContainer"
check_page "offices.html"                        "offices.html"                "officesContainer"
check_page "office-detail.html?office=99501"     "office-detail.html (99501)"  "officeContent"
check_page "map.html"                            "map.html"                    "map"
check_page "notices.html"                        "notices.html"                "noticesContainer"
check_page "filters.html"                        "filters.html"                "alertTypesContainer"
check_page "sources.html"                        "sources.html"                ""
check_page "disclaimer.html"                     "disclaimer.html"             ""
echo ""

# ---- 2. API Dependencies ----
echo "--- API Endpoints ---"

# /api/status/overview — used by index.html
check_api "/api/status/overview"        "GET /api/status/overview"        '"total_offices"'

# /api/advisories/active — used by index, advisories, offices, office-detail, map
check_api "/api/advisories/active"      "GET /api/advisories/active"      '"data"'

# /api/observations — used by index, advisories, offices, office-detail, map
check_api "/api/observations"           "GET /api/observations"           '"data"'

# /api/offices — used by offices, office-detail, map
check_api "/api/offices"                "GET /api/offices"                '"data"'

# /api/notices/active — used by notices.html
check_api "/api/notices/active"         "GET /api/notices/active"         '"data"'

# /api/filters — used by filters.html
check_api "/api/filters"                "GET /api/filters"                '"data"'

# /api/filters/types/all — used by filters.html
check_api "/api/filters/types/all"      "GET /api/filters/types/all"      '"CRITICAL"'

# /api/version — used by footer on all pages (returns version directly, no success wrapper)
VERSION_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/version" 2>/dev/null)
VERSION_BODY=$(curl -s "$BASE/api/version" 2>/dev/null)
if [ "$VERSION_CODE" = "200" ] && echo "$VERSION_BODY" | grep -q '"version"'; then
  pass "GET /api/version — OK"
else
  fail "GET /api/version — HTTP $VERSION_CODE"
fi
echo ""

# ---- 3. Data Integrity ----
echo "--- Data Integrity ---"

# 300 offices
OFFICE_COUNT=$(curl -s "$BASE/api/offices" 2>/dev/null | grep -o '"office_code"' | wc -l | xargs)
if [ "$OFFICE_COUNT" -ge 300 ]; then
  pass "Offices count: $OFFICE_COUNT (expected ≥300)"
else
  fail "Offices count: $OFFICE_COUNT (expected ≥300)"
fi

# Active advisories > 0
ADV_COUNT=$(curl -s "$BASE/api/advisories/active" 2>/dev/null | grep -o '"advisory_type"' | wc -l | xargs)
if [ "$ADV_COUNT" -gt 0 ]; then
  pass "Active advisories: $ADV_COUNT"
else
  fail "Active advisories: $ADV_COUNT (expected > 0)"
fi

# Overview has all expected severity values
OVERVIEW=$(curl -s "$BASE/api/status/overview" 2>/dev/null)
SEVERITIES_OK=true
for sev in Moderate Minor Severe; do
  if ! echo "$OVERVIEW" | grep -q "\"$sev\""; then
    SEVERITIES_OK=false
  fi
done
if [ "$SEVERITIES_OK" = true ]; then
  pass "Overview severities present (Moderate, Minor, Severe)"
else
  fail "Overview missing expected severity values"
fi

# Filters include all 5 impact levels
FILTERS=$(curl -s "$BASE/api/filters/types/all" 2>/dev/null)
LEVELS_OK=true
for level in CRITICAL HIGH MODERATE LOW INFO; do
  if ! echo "$FILTERS" | grep -q "\"$level\""; then
    LEVELS_OK=false
  fi
done
if [ "$LEVELS_OK" = true ]; then
  pass "Filter types include all 5 impact levels"
else
  fail "Filter types missing impact levels"
fi

# Office detail — 99501 (Anchorage) exists in offices response
if curl -s "$BASE/api/offices" 2>/dev/null | grep -q '"99501"'; then
  pass "Office 99501 (Anchorage) found in offices data"
else
  fail "Office 99501 (Anchorage) not found"
fi

echo ""
echo "======================================"
echo -e "Results: ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}"
echo "======================================"

[ "$FAIL" -gt 0 ] && exit 1
exit 0
