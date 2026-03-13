# Storm Scout Frontend Developer Guide

This guide covers the frontend architecture, conventions, and patterns used across all Storm Scout pages. Read this before adding new pages or modifying existing frontend behaviour.

---

## 1. Page Overview

Storm Scout has 8 HTML pages, each with a corresponding embedded JavaScript module:

| Page | File | JS Module | Purpose |
|------|------|-----------|---------|
| Overview Dashboard | `index.html` | `page-index.js` | Summary stats, impacted office cards by severity group, countdown to next update |
| Active Advisories | `advisories.html` | `page-advisories.js` | Full advisory list with card and table views, filter/search, filter-warning banner |
| Offices Impacted | `offices.html` | `page-offices.js` | All offices with active advisories, sortable/filterable table |
| Office Detail | `office-detail.html` | `page-office-detail.js` | Single-office view: advisory list, observations, trend sparkline |
| Interactive Map | `map.html` | `page-map.js` | Leaflet map with severity-colored markers and MarkerCluster |
| Government Notices | `notices.html` | `page-notices.js` | Active government and emergency notices |
| Filter Settings | `filters.html` | `page-filters.js` | Toggle individual alert types, apply presets, persist to localStorage |
| Data Sources | `sources.html` | *(inline script)* | Static information page about data sources |

---

## 2. Page Module Pattern

Each page's JavaScript lives in a dedicated file under `js/` (e.g., `js/page-advisories.js`) loaded via `<script src>` at the bottom of the HTML file. This keeps the dependency graph simple and avoids a build step.

**Pattern:**
```html
<!-- At the bottom of advisories.html -->
<script src="js/utils.js"></script>
<script src="js/api.js"></script>
<script src="js/alert-filters.js"></script>
<script src="js/page-advisories.js"></script>
```

Each page module follows the same internal structure:
```javascript
// js/page-advisories.js

// Module-level state variables declared at the top
let allAdvisories = [];
let observationsMap = {};
let currentView = 'card';

// All functions defined within the module file
async function loadData() { ... }
function renderCards() { ... }

// Entry point: initialize after filters load
AlertFilters.init().then(() => {
    loadData();
});
```

**Conventions:**
- State variables are declared with `let` at the top of the module file — never inside functions
- The entry point is always at the bottom of the module file
- Functions are named descriptively: `loadData`, `renderCards`, `applyFilters`, `handleSearch`
- No classes — functions and module-level variables only

---

## 3. State Management

### Server-side cache (api.js)
Three endpoints use server-side caching (node-cache, 15-minute TTL for unfiltered advisory requests). The server returns cached data on repeated calls within the window.

### Client-side localStorage cache (api.js)
The API client (`frontend/js/api.js`) implements a 5-minute localStorage TTL cache for three frequently-accessed endpoints:

| Cache key | Endpoint | TTL |
|-----------|----------|-----|
| `cache:overview` | `GET /api/status/overview` | 5 minutes |
| `cache:advisories` | `GET /api/advisories/active` | 5 minutes |
| `cache:observations` | `GET /api/observations` | 5 minutes |

Cache entries are stored as `{ data: <response>, ts: <unix ms> }`. On any localStorage error (quota exceeded, private browsing, corrupt JSON), the cache is bypassed silently and the fetch proceeds normally.

**Maximum data staleness:** 5-min client TTL + 15-min ingestion interval = **up to 20 minutes**.

Hard refresh (`Ctrl+Shift+R`) bypasses the localStorage cache by clearing it before the fetch.

### Filter preferences (alert-filters.js)
User filter preferences are persisted to `localStorage` under the key `stormScout_alertFilters` as a flat object mapping alert type strings to booleans:
```json
{ "Tornado Warning": true, "Dense Fog Advisory": false, ... }
```

If localStorage is unavailable or the stored value is corrupt JSON, the `CUSTOM` preset (47/94 types) is applied and a toast warning is shown.

---

## 4. AlertFilters Singleton

`AlertFilters` (in `frontend/js/alert-filters.js`) is a global singleton object initialized once per page load. It manages the user's alert-type filter preferences and provides methods to apply them.

**Initialization:**
```javascript
// Always initialize before loading advisory data
await AlertFilters.init();
```

`init()` makes two API calls:
1. `GET /api/filters` — loads preset definitions (categories and exclusions per preset)
2. `GET /api/filters/types/all` — loads all 94 alert type names grouped by impact level

Then calls `loadUserPreferences()` to restore saved state from localStorage.

**Key methods:**

| Method | Description |
|--------|-------------|
| `AlertFilters.init()` | Load configs from API, restore user prefs. Must await before using filters. |
| `AlertFilters.filterAdvisories(advisories)` | Filter an array: returns only advisories whose `advisory_type` is enabled |
| `AlertFilters.shouldIncludeAlertType(type)` | Check a single type; returns boolean |
| `AlertFilters.applyPreset(presetName)` | Apply a named preset (e.g. `'CUSTOM'`, `'FULL'`) to in-memory state |
| `AlertFilters.getEnabledCount()` | Count of currently enabled alert types |
| `AlertFilters.getTotalAlertTypes()` | Total available alert types (94) |
| `AlertFilters.hasActiveFilters()` | True if not all types are enabled |
| `AlertFilters.getFilterStatus()` | Human-readable name of active filter state |
| `AlertFilters.matchesPreset(name)` | True if current state matches the named preset |

**Filter flow across pages:**
1. User configures filters on `filters.html`; choices are saved to localStorage
2. All other pages call `AlertFilters.init()` on load, which restores saved preferences
3. Pages call `AlertFilters.filterAdvisories(allAdvisories)` to get the working set
4. Counts and office cards are re-calculated from the filtered set — the raw API response is never displayed directly

---

## 5. XSS Safety

**All dynamic content must go through the `html` tagged template or `escapeHtml()`.** Never assign untrusted data directly to `.innerHTML`.

### html tagged template (utils.js)
The `html` tagged template safely escapes interpolated values:
```javascript
// Safe — all ${} values are HTML-escaped automatically
container.innerHTML = html`<div class="office-name">${office.name}</div>`;
```

### escapeHtml (utils.js)
For escaping a single string value:
```javascript
const safe = escapeHtml(userInput);
```

### raw() — trusted content bypass
`raw()` wraps a string to mark it as already-safe, bypassing escaping in `html` template literals. Use only for:
- CSS class names derived from enum values (e.g. `raw(escapeHtml(severity.toLowerCase()))`)
- HTML sub-fragments that have already been built with `html` or `escapeHtml`
- Bootstrap class name strings from controlled sources

**Never pass user-supplied data through `raw()` without first calling `escapeHtml()` on it.**

### Example pattern from page-index.js
```javascript
// Safe: severity comes from server enum; escaped before raw()
const severityClass = `office-card-${escapeHtml(site.highest_severity.toLowerCase())}`;
container.innerHTML = html`
    <div class="${raw(severityClass)}">
        ${site.office_name}     <!-- auto-escaped by html tag -->
    </div>
`;
```

---

## 6. UpdateBanner Lifecycle

`UpdateBanner` (in `frontend/js/update-banner.js`) manages the "Last Updated / Next Update" bar shown on most pages.

**Initialization** (automatic):
```javascript
// DOMContentLoaded handler in update-banner.js
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('lastUpdated') || document.getElementById('nextUpdate')) {
        UpdateBanner.init();
    }
    ...
});
```

`UpdateBanner.init()` fetches `GET /api/status/overview`, reads `last_updated` and `update_interval_minutes`, and starts a 1-second countdown interval.

**Ingestion polling:**
When the countdown reaches zero, `UpdateBanner` switches to polling `GET /health` every 10 seconds. When `ingestion.active` flips from `true` to `false`, it calls `UpdateBanner.init()` again to re-sync the banner with the latest data.

**Destroy (leak prevention):**
`UpdateBanner.destroy()` clears both `countdownInterval` and `pollingInterval` and resets `isPollingIngestion`. It is called automatically in two situations:
1. `window.addEventListener('beforeunload', ...)` — page unload/navigation
2. `document.addEventListener('visibilitychange', ...)` — tab goes to background

When the tab returns to foreground, `UpdateBanner.init()` is called again to re-sync.

**Do not call `clearInterval` manually** for UpdateBanner timers — always use `UpdateBanner.destroy()` to ensure both intervals are cleared and state is reset correctly.

---

## 7. API Client (api.js)

`frontend/js/api.js` exports a global `API` object. All backend calls must go through this object — never call `fetch()` directly from page files.

**Base URL resolution:**
```javascript
const API_BASE_URL = (window.location.hostname === 'localhost' || ...)
  ? `${window.location.protocol}//${window.location.host}/api`
  : '/api';
```

**Making calls:**
```javascript
// All API methods return Promises; use async/await
const advisories = await API.getActiveAdvisories();
const trend = await API.getOfficeTrend(officeId, 7);
```

**Error handling:**
- Methods that return `{ success: false, error: '...' }` throw an `Error` with the message
- Methods that call history or trends endpoints return the raw response object; check `response.status` or `response.error` before using

**TTL cache invalidation:**
The localStorage cache is not invalidated explicitly between page loads. It expires naturally after 5 minutes. If you need fresh data in a test or after a known ingestion, clear the relevant localStorage key:
```javascript
localStorage.removeItem('cache:advisories');
```

**Available methods:**

| Method | Endpoint | Cached |
|--------|----------|--------|
| `API.getVersion()` | `GET /api/version` | In-memory (session) |
| `API.getOverview()` | `GET /api/status/overview` | localStorage 5 min |
| `API.getActiveAdvisories()` | `GET /api/advisories/active` | localStorage 5 min |
| `API.getImpactedOffices()` | `GET /api/status/offices-impacted` | No |
| `API.getActiveNotices()` | `GET /api/notices/active` | No |
| `API.getObservations()` | `GET /api/observations` | localStorage 5 min |
| `API.getOffices()` | `GET /api/offices` | No |
| `API.getTrends(days)` | `GET /api/trends?days=N` | No |
| `API.getOfficeTrend(id, days)` | `GET /api/trends/:id?days=N` | No |
| `API.getOfficeHistory(id, days)` | `GET /api/trends/:id/history?days=N` | No |
| `API.getOverviewTrends(days)` | `GET /api/history/overview-trends?days=N` | No |
| `API.getSeverityTrends(days)` | `GET /api/history/severity-trends?days=N` | No |
| `API.getOfficeTrends(id, days)` | `GET /api/history/office-trends/:id?days=N` | No |
| `API.getHistoricalDataAvailability()` | `GET /api/history/data-availability` | No |

---

## 8. Adding a New Page

Follow this checklist when adding a new page to Storm Scout:

### Step 1 — Create the HTML file
Copy the structure from an existing page (e.g. `offices.html`). Include:
- Standard `<head>` with Bootstrap 5.3 CSS, `style.css`, and SRI hashes on all CDN resources
- Navbar with correct active link
- Update banner div (if showing last-updated timestamp)
- Main content area with loading/error/empty state placeholders
- Standard `<script>` includes in this order: `utils.js`, `api.js`, `alert-filters.js` (if using filters), `update-banner.js` (if showing banner), any page-specific utilities, then the inline page script

### Step 2 — Write the page script
Create the inline `<script>` block at the bottom of the HTML:
```javascript
// 1. Declare all state variables at module level
let allData = [];

// 2. Write render functions using html`` template
function render(data) {
    const container = document.getElementById('content');
    container.innerHTML = html`<div>${data.name}</div>`;
}

// 3. Write the load function with error handling
async function loadData() {
    try {
        allData = await API.getMyEndpoint();
        render(allData);
    } catch (err) {
        console.error('Failed to load:', err);
        document.getElementById('content').innerHTML = renderErrorHtml('Failed to load data');
    }
}

// 4. Entry point — initialize filters if needed, then load
AlertFilters.init().then(() => {
    loadData();
});
```

### Step 3 — XSS review checklist
Before submitting a PR, verify:
- [ ] All dynamic content uses `html\`\`` or `escapeHtml()`
- [ ] Any use of `raw()` wraps only server-enum values or pre-escaped strings
- [ ] No `element.innerHTML = userValue` without escaping
- [ ] URL parameters read via `new URLSearchParams(window.location.search)` and escaped before insertion into DOM

### Step 4 — Add to navigation
Update the navbar in all 8 existing HTML files to include the new page link.

### Step 5 — Register in README
Add the new page to the "Project Structure" file list and "Key API Endpoints" section in `README.md`.

### Step 6 — Update this guide
Add the new page to the page table in Section 1 of this document.
