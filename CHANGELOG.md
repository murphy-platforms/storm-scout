# Changelog

All notable changes to Storm Scout will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Historical data API endpoints for trend retrieval
- Trend visualization dashboards
- Predictive analytics based on historical patterns
- Database backup automation
- Global alert source implementation (ECCC, MeteoAlarm, SMN adapters)

## [1.10.1] - 2026-03-10

### Security

- **#119 CVE-2026-27903 (minimatch ReDoS)** — `qs` dependency pinned to `6.14.2` via `package.json` `overrides` block; same pin already applied for CVE-2026-2391 (prototype pollution) so no new `npm install` step required; `overrideReasons` field added to `package.json` documenting both CVEs and the review-and-remove trigger; CVE tracked in `docs/security/README.md`

### Added

- **#120 Architecture & scale documentation** — `docs/ARCHITECTURE.md` created; documents system overview diagram, current tested scale (300 locations, 40-connection pool, 80 KB gzipped advisory response), scale ceilings by component (UI, backend/API, database, infrastructure), five re-evaluation triggers, minimum required changes before >500 locations, planned architectural work, and key file index; all ceiling and pagination claims verified against source code

### Changed

- **docs/security/README.md** — Added "Active Vulnerability Tracking" row for CVE-2026-27903; added "Dependency Overrides" section with `npm ls qs` maintenance procedure; added "Secret Rotation Policy" with zero-downtime steps for `API_KEY` (90-day) and `DB_PASSWORD` (180-day); added optional API key rotation note (`STATE_EMERGENCY_API_KEY`, `FEMA_API_KEY`); added Rotation Log table

## [1.10.0] - 2026-03-10

### Added

- **#109 Jest test suite** — `jest.config.js` added (testEnvironment: `node`, explicit roots, 40% coverage thresholds); `supertest` added to devDependencies; three new test files: `tests/unit/apiKey.middleware.test.js` (5 cases: valid key, missing key, wrong key, same-length wrong key, unconfigured key → 503), `tests/unit/advisory.model.test.js` (dedup by external_id, VTEC, natural key, new insert; `findByNaturalKey` null handling), `tests/integration/advisories.route.test.js` (active list, empty state, severity filter, invalid input → 400, `/ping` liveness)
- **#112 API-driven ingestion pause** — `backend/src/routes/admin.js` adds `POST /api/admin/pause-ingestion`, `POST /api/admin/resume-ingestion`, and `GET /api/admin/status` endpoints, all protected by `requireApiKey`; pause waits for any active ingestion cycle to complete via `waitForIngestionIdle()` before returning; both endpoints are idempotent; `deploy.sh` updated to call these endpoints via curl using `DEPLOY_API_KEY` env var; `DEPLOY_API_KEY` documented in `.env.production.example`; ERR trap in `deploy.sh` now calls `resume_ingestion()` on failure so a failed deploy cannot leave ingestion permanently stopped
- **#115 Search input debounce** — `debounce(fn, wait)` utility added to `frontend/js/utils.js`; applied at 300ms to the `searchBox` `input` listener in `page-offices.js` and `page-advisories.js`; `select`/`change` listeners left unbounced (discrete actions)
- **#118 localStorage error handling** — `loadUserPreferences()` in `alert-filters.js` wrapped in try/catch; on `SecurityError`, `SyntaxError`, or any localStorage failure, default preset is applied and a toast notification is shown; `showToast(message, type)` helper added to `utils.js` using Bootstrap 5.3 Toast API

### Fixed

- **#113 DB statement timeout** — `database.js` `pool.on('acquire')` handler executes `SET SESSION max_statement_time = N` on every connection; prevents long-running queries (Haversine geo, history scans) from hanging indefinitely and exhausting the pool; configurable via `DB_STATEMENT_TIMEOUT_SECONDS` env var (default 30s); falls back gracefully with a console warning when the session variable is unsupported
- **#114 Natural-key dedup guard** — `advisory.js` `create()` now performs a last-resort `findByNaturalKey()` lookup `(office_id, advisory_type, source, start_time)` before the bare INSERT when both `external_id` and `vtec_event_id` are null; prevents duplicate rows from malformed NOAA payloads on retry; `start_time IS NULL` handled correctly in the query; fallback logs a warning when triggered
- **#116 Empty-state consistency** — `page-advisories.js` table-view empty state replaced with `renderEmptyHtml()` utility call (was hardcoded inline HTML); now matches the card view and offices page pattern
- **#117 UpdateBanner interval cleanup** — `update-banner.js` `destroy()` method clears both `countdownInterval` and `pollingInterval` and resets the polling guard flag; `beforeunload` listener calls `destroy()` to prevent timer leaks on navigation; `visibilitychange` listener calls `destroy()` when tab is hidden and re-calls `init()` when tab becomes visible again, preventing unnecessary API polling in background tabs

### Closed (no code change)

- **#110 PM2 log rotation** — `deployment/ecosystem.config.js` already contained `log_date_format: 'YYYY-MM-DD HH:mm:ss Z'` and `merge_logs: true`; no code change required; note: `pm2 install pm2-logrotate` is a one-time server setup step
- **#111 Health check backoff in deployment/deploy.sh** — 5-attempt exponential backoff loop was already present from commit `e38101f`; cPanel `deploy.sh` has no automated health check by design (restart is manual via cPanel UI)

## [1.9.9] - 2026-03-10

### Security

- **#95 Timing-safe API key comparison** — `apiKey.js` middleware replaced `!==` string equality with `crypto.timingSafeEqual()` (with mandatory length pre-check) to prevent timing side-channel attacks against the API key; `require('crypto')` added at top of module
- **#96 Advisory type enum whitelist** — `validators/advisories.js` builds a `Set` from all values in `NOAA_ALERT_TYPES` and validates each comma-separated `advisory_type` query param against it; unknown types are rejected before reaching SQL, preventing injection of arbitrary strings into queries

### Added

- **#97 Database SSL support** — `config.js` reads `DB_SSL=true` env var and wires `{ rejectUnauthorized: true }` into the mysql2 connection pool; `.env.production.example` documents the option with guidance (leave `false` for localhost/cPanel Unix socket deployments)
- **#98 Fail-fast startup validation** — `config.js` checks five required env vars (`DB_USER`, `DB_PASSWORD`, `DB_NAME`, `NOAA_API_USER_AGENT`, `API_KEY`) on startup when `NODE_ENV=production`; missing vars emit a single `[FATAL]` block to stderr and call `process.exit(1)`; skipped entirely in development so `init-db`/`seed-db` scripts run without a full `.env`
- **#99 Pre-deploy smoke test gate** — `deploy.sh` calls `backend/scripts/smoke-test.sh` before any rsync; deploy aborts on any failing check; `SKIP_SMOKE_TEST=true` escape hatch for emergency deploys
- **#100 Deterministic deploys + migrations** — `deploy.sh` `post_deploy()` replaced `npm install --production` with `npm ci --production`; `npm run migrate` (idempotent) added before app restart; `APPLY_MIGRATIONS=false` escape hatch; same changes applied to `deployment/deploy.sh` (PM2 variant) with exponential backoff health verification (5 attempts)
- **#101 GitHub Actions CI** — `.github/workflows/ci.yml` runs `npm ci`, `npm audit --audit-level=high`, and `npm test` on every push to `main` and all pull requests
- **#103 Ingestion alert deduplication + recovery** — `scheduler.js` `handleIngestionResult()` now alerts only on the **first** failure (not first AND third); new `alertIngestionRecovery()` function in `alerting.js` sends an all-clear notification when ingestion succeeds after a failure streak; `INGESTION_RECOVERY` added to `AlertTypes`
- **#104 /ping liveness endpoint** — `app.get('/ping')` returns `{ status: 'ok' }` with no database I/O; intended for process supervisor keep-alive checks (distinct from `/health` readiness probe which may return 503)
- **#108 Map marker clustering** — `map.html` loads `leaflet.markercluster` CSS + JS; `page-map.js` replaces `L.layerGroup()` with `L.markerClusterGroup({ maxClusterRadius: 60, iconCreateFunction: createClusterIcon })`; `createClusterIcon()` colors cluster badges by highest child marker severity; `severity` stored as custom marker option

### Fixed

- **#105 N+1 query in getAllTrends()** — `advisoryHistory.js` `getAllTrends()` replaced a `DISTINCT office_id` query + `Promise.all(officeIds.map(getTrend))` fan-out (up to 300 concurrent queries) with a single SQL query fetching all rows in the window followed by O(n) JS grouping by `office_id`
- **#107 Correlated subquery in getImpacted()** — `officeStatus.js` `getImpacted()` replaced a correlated `COUNT(*)` subquery (executed once per result row) with a derived-table `LEFT JOIN` that aggregates advisory counts in a single pass before joining; `COALESCE(ac.advisory_count, 0)` preserves zero-count behavior

### Documented

- **#102** — Closed without code change; `npm ci` in deploy scripts was already implemented in commit `e38101f`
- **#106 FK constraint workaround** — `schema.sql` now includes a block comment before `CREATE TABLE advisories` explaining the MariaDB/MySQL limitation (FK not allowed on columns referenced by `GENERATED ALWAYS AS`), the application-layer enforcement via pre-insert `INSERT IGNORE INTO alert_types`, and the residual orphan risk + mitigations

## [1.9.8] - 2026-03-10

### Fixed

- **#82 map.html error banner always visible** — `#mapErrorBanner` had `style="display:none"` which Bootstrap's `.row { display: flex }` overrode before page JS ran; replaced with `.d-none` class (`display:none !important`); catch block updated from `banner.style.display = ''` to `banner.classList.remove('d-none')` (`map.html`, `page-map.js`)
- **#83 Systemic inline style overridden by Bootstrap** — audited all pages; found 6 elements across 4 pages (`index.html`, `advisories.html`, `offices.html`, `office-detail.html`) using `style="display:none"` on Bootstrap `.row` elements; all replaced with `.d-none`; corresponding JS updated from `style.display` assignments to `classList.add/remove('d-none')`

### Added

- **#88 NOAA circuit breaker** — CLOSED/OPEN/HALF_OPEN state machine in `api-client.js`; opens after 3 consecutive exhausted-retry failures; rejects requests immediately while OPEN; probes recovery after 60s; closes after 2 successful probes; state exposed via `getCircuitBreakerState()` and surfaced in `/health`
- **#91 Graceful shutdown** — SIGTERM/SIGINT handler in `server.js` drains HTTP connections (30s safety timeout), stops scheduler, waits for active ingestion cycle (up to 60s via `waitForIngestionIdle()`), closes DB pool via `pool.end()`; `waitForIngestionIdle` exported from `scheduler.js`
- **#93A Gzip compression** — `compression` package added; `app.use(compression())` placed after `cors()` in middleware stack; ~85% reduction in API response payload
- **#93B Client-side localStorage cache** — `getActiveAdvisories()`, `getOverview()`, `getObservations()` in `api.js` cache responses in localStorage with 5-min TTL; failures (private browsing, quota exceeded) silently bypass caching; max staleness 20 min (5-min client + 15-min ingestion interval)
- **#93C Advisory pagination** — `GET /api/advisories/active?page=N&limit=N` (max limit 200); returns `{ total, pages, page, limit }` in envelope when paginated; default (no params) preserves existing full-dataset behaviour; paginated requests bypass server-side cache

### Changed

- **#89 Rate limiter** — `apiLimiter` window extended from 15 min to 60 min; limit raised from 5,000 to 30,000 req/window (same 500 req/min sustained rate); accommodates corporate NAT environments where many users share one IP; configurable via `RATE_LIMIT_API_MAX` env var
- **#85 DB connection pool** — `connectionLimit` increased from 20 to 40 (configurable via `DB_POOL_LIMIT`); `queueLimit` raised from 50 to 100; `acquireTimeout` removed (not a valid mysql2 option — was silently ignored); pool exhaustion sets `error.isPoolExhausted` flag
- **#86 Cache invalidation** — `cache.invalidateAll()` in ingestor replaced with `cache.invalidateDynamic()`; static keys (`ALL_SITES`, `STATES_LIST`, `REGIONS_LIST`) preserved across ingestion cycles; `advisories:filtered:*` keys cleared; `ACTIVE_ADVISORIES` pre-warmed immediately after invalidation
- **#87 Ingestion performance** — bulk pre-fetch of all existing active advisories for affected offices added inside the transaction (one query replaces 2×N per-row SELECTs); `AdvisoryModel.create()` accepts optional `existingLookup` maps; NOT IN expiration query chunked into 500-ID batches
- **#92 Filtered query caching** — filtered `GET /api/advisories/active` requests now cached with composite deterministic key `advisories:filtered:${sortedParams}` (5-min TTL); parameter order-independent; invalidated on each ingestion cycle
- **#94 Observability** — `/health` now includes `uptime` (seconds + human-readable), `memory` (heapUsedMb, heapTotalMb, rssMb, externalMb), `noaaCircuitBreaker` state; request logging extended to production when `LOG_FORMAT=json` (structured JSON with ts, method, path, status, ms, ip, ua); `.env.production.example` updated with `LOG_FORMAT` and `RATE_LIMIT_API_MAX`

### Closed (no code change)

- **#90 Process supervisor** — resolved by existing Passenger infrastructure on cPanel host; `ecosystem.config.js` created as documentation for non-Passenger deployments; `NODE_OPTIONS=--max-old-space-size=384` must be set in cPanel Node.js environment variables UI (not in `.env`)

## [1.9.7] - 2026-03-09

### Fixed

- **#79 map.html error banner — Express route ordering** — `/:filterName` was registered before `/types/all` and `/types/:level` in `filters.js`; Express matched `GET /api/filters/types/all` as `filterName = "types"`, returned `{ success: false }`, causing `AlertFilters.init()` to assign `undefined` to `this.alertTypesByLevel`; `applyPreset()` then threw `TypeError: Cannot convert undefined or null to object`, triggering the error banner on `map.html`. Fixed by reordering: `/types/all` and `/types/:level` are now registered before `/:filterName`
- **#80 AlertFilters.init() silent error swallowing** — added `success` field guards on both API responses in `init()`; a failed response now throws an explicit `Error` instead of silently assigning `undefined` to internal state; `page-map.js` now checks the `init()` return value and throws if initialization failed
- **#81 Null guard on highest_severity** — `renderMarkers()` in `page-map.js` now falls back to `'Minor'` when `office.highest_severity` is null, preventing a `TypeError` from crashing the entire map render

## [1.9.6] - 2026-03-09

### Fixed

- **#76 Stale seed notices on notices.html** — removed 3 fabricated emergency declaration `INSERT`s from `seed.sql`; notices are populated by ingestion only; migration `20260309-remove-seed-notices.sql` deletes the rows from any database previously seeded
- **#77 Jurisdiction filter returns no results** — removed `.toLowerCase()` from `validateJurisdiction` in `notices.js` validator and updated `VALID_JURISDICTIONS` to Title-Case (`['Federal', 'State', 'County', 'City']`) to match values stored in the database; filter now works correctly

### Documented

- **#78 local-ingestor.js is a no-op stub** — filed as enhancement; `notices` table has no real data source until a FEMA/state RSS ingestion adapter is implemented

## [1.9.5] - 2026-03-09

### Fixed (Accessibility & UI/UX — closes #63–#74)

- **#63 Skip-to-content links** — added `<a class="skip-to-content">` and `id="main-content"` to all 8 pages (`index.html`, `advisories.html`, `offices.html`, `office-detail.html`, `map.html`, `notices.html`, `filters.html`, `sources.html`) enabling keyboard-only WCAG SC 2.4.1 bypass
- **#64 Map legend color-only markers** — legend icons now display letter initials (E / S / M / Mi) with `role="img"` and `aria-label`; `map.css` legend-icon updated to flex layout for centering; fixes WCAG SC 1.4.1 (Use of Color)
- **#65 Emoji in select option values** — removed emoji circles (🔴🟠🟡🟢) from `offices.html` weather-impact `<select>` options and matching `page-offices.js` label strings; labels now use plain text (e.g. "Extreme — High Impact")
- **#66 Decorative emoji missing aria-hidden** — wrapped 🌡️ temperature emoji in `<span aria-hidden="true">` across all 5 page JS files (12 total occurrences) so screen readers skip decorative glyphs; fixes WCAG SC 1.1.1
- **#67 Disabled filter card contrast** — `filters.css` replaced `opacity: 0.7` with explicit `color: #6c757d` on disabled `.alert-type-card` elements; achieves ~4.5:1 contrast on `#f8f9fa` background; fixes WCAG SC 1.4.3
- **#68 Hardcoded hex colours in status/border CSS** — `style.css` status badges (`.status-closed/restricted/pending/open`) and office-card border classes now use CSS variables (`--severity-extreme`, `--severity-severe`, `--severity-moderate`, `--ss-green`, `--bs-secondary`) instead of hardcoded hex values
- **#69 Alert modal missing ARIA attributes** — `office-detail.html` alert modal now has `role="dialog"` and `aria-modal="true"`; fixes WCAG SC 4.1.2
- **#70 Semantic heading anti-pattern** — removed Bootstrap size-override class from all `<h1>` elements across all 8 pages (`class="h2"` / `class="h3 mb-1"` stripped); headings now carry correct semantic weight
- **#71 Help icon contrast below WCAG AA** — `tooltips.css` help icon color darkened from `#6c757d` to `#5a6472` (≥4.5:1 contrast on white); fixes WCAG SC 1.4.3
- **#72 Office card title text overflow** — `style.css` added `overflow-wrap: break-word; word-break: break-word` to `.office-card .card-body h6` and `.office-card-title` to prevent long names overflowing card boundaries
- **#73 Moderate severity badge text colour** — `style.css` `.severity-moderate` text colour updated from hardcoded `#000` to `var(--severity-moderate-text)` for consistent theming
- **#74 Map full-width on ultra-wide screens** — `map.css` `#map` now has `max-width: 1800px` to prevent excessive horizontal stretch on ultra-wide displays

### Changed
- All inline page `<script>` blocks externalised to `js/page-*.js` files (`page-index.js`, `page-advisories.js`, `page-offices.js`, `page-office-detail.js`, `page-notices.js`, `page-filters.js`, `page-map.js`) allowing removal of `'unsafe-inline'` from CSP `scriptSrc` (closes #61)
- Cache-busting version strings updated to `?v=1.9.5` across all 8 HTML pages

## [1.9.4] - 2026-03-09

### Fixed
- **All pages silent spinner (closes #62)** — CSP `script-src` directive lacked `'unsafe-inline'`, which caused browsers to silently block all inline `<script>` blocks on every page; data never loaded and no error was shown to the user. Root cause: issue #15 removed `unsafe-inline` intending to externalise inline scripts, but the migration was never completed. Hotfix: `'unsafe-inline'` restored to `app.js` `scriptSrc`. Proper remediation (externalising all page scripts) tracked in #61.

## [1.9.3] - 2026-03-09

### Fixed
- **Dashboard counts not loading (`index.html`)** — `loadOverview` now sets all stat counters (`weatherTotal`, `weatherRed`, `weatherOrange`, `weatherYellow`, `totalSites`, `sitesWithAdvisories`) before calling `renderSiteGroups`, so counts are always populated even if card rendering throws; `renderSiteGroups` wrapped in its own `try/catch` to isolate render errors from data-display logic
- **Null advisory crash in `renderSiteSummary`** — added `|| {}` guard on `site.highest_severity_advisory` so accessing `.headline`/`.advisory_type`/`.expires` never throws a `TypeError` if the field is unexpectedly absent
- **`filters.html` failing to load** — stale `?v=1.9.1` cache-busting strings caused browsers to serve an old cached `utils.js` (pre-audit) that lacked `renderErrorHtml`; any `loadData()` failure then triggered a secondary uncaught `ReferenceError`, leaving the spinner permanently
- **Cache-busting strings** — updated `?v=1.9.1` → `?v=1.9.2` across all 8 HTML pages (`index.html` had already been updated; `advisories.html`, `filters.html`, `map.html`, `notices.html`, `office-detail.html`, `offices.html`, `sources.html` updated now)

### Changed
- **Script terminology** — `add-new-offices.js` and `verify-offices.js` variable names updated from `site` to `office` to match USPS refactor naming conventions

## [1.9.2] - 2026-03-09

### Changed (UI/UX Audit — 31 issues resolved, closes #26–#60)

#### CSS Design System
- **CSS variable consolidation** — renamed all `--pm-*` (Prometric legacy) variables to `--ss-*`; removed 6 unused `:root` variables
- **Z-index scale** — added `--z-sticky-content`, `--z-sticky`, `--z-banner`, `--z-skip-link`, `--z-tooltip` to `:root`; all hardcoded z-index values replaced with variables across 5 CSS files
- **Transition durations** — added `--transition-base: 0.2s ease` and `--transition-slow: 0.3s ease`; replaced all hardcoded `0.2s`/`0.3s`/`0.15s` values across `style.css`, `filters.css`, `map.css`, `tooltips.css`
- **Card header system** — added `--ss-card-header-bg`, `--ss-card-header-notice-bg` variables; new `.card-header-brand` and `.card-header-notice` classes; removed Bootstrap `bg-primary`/`bg-secondary`/`bg-warning-subtle` utility overrides on card headers
- **Severity badge sizing** — added `.severity-badge` (standard, 0.75rem) alongside existing `.severity-badge-large` (1rem, hero display only); card-level badges now use the standard size
- **Clickable card utility** — consolidated `.weather-card-clickable` and `.office-card-clickable` into a single `.card-clickable` utility class
- **Badge font-weight** — removed custom `font-weight: 600` override on `.badge`; Bootstrap default `700` now applies uniformly
- **Dead CSS removed** — Beta UI sidebar/sparkline `@media` block (~110 lines) removed from `mobile.css`; 6 unused `:root` variables removed from `style.css`

#### Icons & Visual Consistency
- **Icon system** — standardized on Bootstrap Icons for all UI chrome; replaced emoji (🆕 ❌ ✅ ⚠️ 🔄 🚫 ✏️ 📋 ⏱️) in VTEC action badges, status badges, alert-stat-icons, and filter-warning-icon; 🌡️ temperature and color circles in `<select>` options retained as appropriate
- **Severity text colors** — `map.html` stat card numbers now use `.text-severity-*` classes (was Bootstrap `text-danger/warning/secondary`); `advisories.html` summary stats replace hardcoded hex values (`#dc3545`, `#fd7e14`, `#ffc107`, `#28a745`) with `.text-severity-*` classes
- **Filter indicator badge** — replaced `bg-info text-dark` with `.badge-filter-active` (uses `--ss-navy`); updated `print.css` hide-on-print selector accordingly

#### Page Improvements
- **Favicon** — added `favicon.svg` (navy circle + green lightning bolt); `<link rel="icon">` added to all 8 live pages
- **Update banner on map** — `map.html` now shows the data-freshness update banner (was missing; present on index, offices, advisories)
- **Tooltip component** — `tooltips.css` now loaded on all 8 pages (was index.html only); `.tooltip-wrapper`/`.help-icon`/`.tooltip-content` pattern available everywhere
- **Breadcrumb office name** — `office-detail.html` breadcrumb active item now shows dynamic `"{code} — {name}"` instead of static "Office Detail"
- **Shared utilities** — `utils.js`: added `VTEC_ACTION_CONFIG`, `getActionBadge()`, `getActionBadgeWithTime()`, `renderEmptyHtml()`, `renderErrorHtml()`; local duplicates removed from `advisories.html` and `office-detail.html`

#### Standardized States
- **Loading states** — all spinners have `role="status"` + `<span class="visually-hidden">Loading...</span>` and consistent padding (`py-4`/`py-5`)
- **Error states** — standardized to Bootstrap `alert-danger` with `role="alert"` and `bi-exclamation-triangle-fill` icon via `renderErrorHtml()`
- **Empty states** — standardized to icon + title + subtitle layout via `renderEmptyHtml()`
- **Temperature display** — extracted inline `margin-top: 0.35rem; font-size: 0.85rem;` to `.temp-display` CSS class; applied across all 5 pages
- **Footer** — updated to consistent two-column layout (copyright left, nav links right) across all pages; pages do not self-link in their footer nav

## [1.9.1] - 2026-03-08

### Fixed
- **Dashboard "Recently Updated Offices" always empty** - `recently_updated` items from the overview API have an `id` field (office_status row ID) and a separate `office_id` field (actual office ID); the filter was incorrectly comparing `adv.office_id === site.id` instead of `site.office_id`, so the panel always showed "No offices with advisories" even when active advisories existed
- **Export button 404** - Export function fetched the non-existent `/api/sites/requiring-attention` endpoint; updated to use `/api/status/offices-impacted`
- **CUSTOM filter preset name/description** - `noaa-alert-types.js` CUSTOM preset had stale name "Site Default" and description "testing center operations"; updated to "Office Default" and "USPS operations"
- **Stale "Site" terminology in frontend** - Remaining `site`/`Site` copy in `advisories.html` (page heading, search placeholder, filter dropdown) and `filters.html` (preset button, reset confirm dialog) updated to `office`/`Office`

## [1.9.0] - 2026-03-08

### Added
- **systemd User Service** (`deployment/storm-scout-dev.service`) - Persistent DEV/QC server managed by systemd; auto-starts on boot via `loginctl enable-linger`, restarts on crash with 10-second backoff; logs captured by journald (`journalctl --user -u storm-scout-dev`)
- **Docker MariaDB** - Database container configured with `restart=unless-stopped` so it survives reboots without manual intervention

### Changed
- **USPS Refactor** - Replaced 229 Prometric testing center locations with 300 USPS offices identified by 5-digit zip codes; removed all ProInsights/Prometric references
- **site→office Rename (Full Stack)** - Renamed all `site`/`sites` terminology to `office`/`offices` across the entire codebase:
  - Database tables: `sites→offices`, `site_status→office_status`, `site_observations→office_observations`
  - Database columns: `site_code→office_code`, `site_id→office_id` in all tables
  - Backend models, routes, ingestion pipeline, and utility scripts
  - Frontend HTML pages, JavaScript modules, and API client
  - File renames: `sites.html→offices.html`, `site-detail.html→office-detail.html`, `sites.json→offices.json`, `import-usps-sites.js→import-usps-offices.js`
  - Legacy `?site=` URL param accepted as fallback on `offices.html` and `office-detail.html`
- **Deployment Platform** - Migrated from cPanel/Passenger to Ubuntu Linux with systemd + Docker; updated `DEPLOY.md` and `docs/deployment.md` accordingly

### Fixed
- **deploy.sh rsync excludes `tmp/`** - Added `--exclude 'tmp/'` to backend rsync to prevent overwriting the Passenger `tmp/` directory during deployment
- **NOAA ISO 8601 timestamp handling** - Convert NOAA timestamps to UTC-normalized `DATETIME` strings compatible with MariaDB
- **minimatch ReDoS** (CVE-2026-27903) - Patched `minimatch` dependency to remediate ReDoS vulnerability
- **`system_snapshots` table** - Applied missing migration (`20260214-add-system-snapshots.sql`) to dev database; historical snapshot scheduler now completes successfully

## [1.8.1] - 2026-02-25

### Changed
- **Bootstrap Upgrade** - Upgraded Bootstrap CSS/JS from 5.3.0 to 5.3.8 and Bootstrap Icons from 1.11.1 to 1.13.1 across all 8 HTML pages
- **SRI Hash Updates** - Updated all Subresource Integrity hashes for Bootstrap CSS, JS, and Icons; added missing SRI hash for Leaflet CSS in map.html
- **Consolidated Helper Functions** - Moved duplicate helper functions (`cToF`, `timeAgo`, `isStale`, `truncate`, `formatLocalTime`) from 5 inline page scripts into shared `js/utils.js`
- **Cache-Busting Strings** - Updated `?v=1.8.0` → `?v=1.8.1` across all 8 HTML pages

## [1.8.0] - 2026-02-25

### Added
- **Ingestion Status API** (#73) - `/health` endpoint now includes `ingestion.active` and `ingestion.startedAt` fields for real-time ingestion tracking
- **X-Data-Age Header** - All `/api/*` responses include `X-Data-Age` header showing seconds since last successful ingestion
- **Smart Update Countdown** - Frontend countdown shows spinner and polls `/health` when data refresh is expected, auto-reinitializes when ingestion completes
- **Cache-Control Headers** (#74) - HTML files served with `no-cache, no-store, must-revalidate`; static assets (CSS/JS/images) cached for 7 days via `max-age=604800`
- **Version-Based Cache Busting** (#72) - All local CSS/JS references across all 8 HTML pages include `?v=1.8.0` query params to force browser cache invalidation on deploy

### Fixed
- **Orphaned Service Worker** (#71) - Replaced beta-era cache-first service worker (`sw.js`) with self-unregistering stub that clears all SW caches and unregisters itself on any browser that still has it installed. This was the likely root cause of stale page loads on some machines.

### Removed
- `frontend/js/pwa.js` - PWA registration script (no pages loaded it; orphaned from beta era)
- `frontend/manifest.json` - PWA manifest (no pages referenced it; orphaned from beta era)

## [1.7.5] - 2026-02-24

### Added
- **Global Alert Source Architecture** - Expert-reviewed adapter pattern design for multi-country weather alert support (ECCC/Canada, MeteoAlarm/EU, SMN/Mexico). Architecture and QC plans finalized; implementation is future work.
- **Smoke Test XSS Audit** - `smoke-test.sh` now includes automated innerHTML safety check (check #11) scanning all frontend `.html` and `.js` files for unsafe `innerHTML` usage without `html` tagged template (closes #64)
- **NOAA Alerts Snapshot Fixture** - 540-alert NOAA fixture (`tests/fixtures/noaa-alerts-snapshot.json`) captured for future regression testing (closes #62)
- **MariaDB-Compatible Rollback Migration** - `rollback-global-alert-sources.sql` corrected to use MariaDB-compatible `DROP TABLE IF EXISTS` syntax instead of MySQL-only batch drops (closes #61)
- **Version Display in UI** - All 8 page footers now show version number and release date (`v1.7.5 · Feb 24, 2026`) via `/api/version` endpoint (closes #70)
- **`/api/version` Endpoint** - Returns version and release date from `package.json` as single source of truth
- **GitHub Release Tags** - Standardized on `v` prefix convention; release workflow documented in AGENTS.md

### Changed
- **Safe Deployment** - `deploy.sh` now includes `pause_ingestion()` and `resume_ingestion()` functions that disable the cron scheduler before rsync and re-enable after restart, preventing mid-cycle data corruption (closes #60)
- **package.json Version** - Synced from stale `1.0.0` to actual project version `1.7.5` with `releasedDate` field

### Security
- Expert panel review completed: 5-expert review produced 16 findings; 3 critical + 8 medium findings remediated (GitHub issues #59-69 all closed)

## [1.7.4] - 2026-02-22

### Changed
- **Dashboard Card Sort** - Site cards within each severity group on the dashboard now sort by site code ascending (lowest to highest) instead of urgency score (closes #58)

## [1.7.3] - 2026-02-22

### Fixed
- **Sites Missing NOAA Alerts** - Fixed critical bug where sites were silently missing alerts due to table-wide UNIQUE constraint on `external_id` (closes #57)
  - Root cause: When one NOAA alert matched multiple sites via UGC zones, only the first site processed got the advisory row
  - Changed `UNIQUE(external_id)` to composite `UNIQUE(external_id, site_id)` so the same alert can exist once per site
  - Updated `findByExternalID()` to filter by site_id (was returning rows for wrong sites)
  - Updated cleanup module to account for valid multi-site external_ids
  - Dropped redundant duplicate index `idx_external_id_unique`

## [1.7.2] - 2026-02-22

### Changed
- **Card View Default Sort** - Card view on advisories page now defaults to site code ascending, matching table view (closes #56)
- **Grouped Table View** - Table view on advisories page now groups alerts by site instead of showing flat duplicate-looking rows (closes #55)
  - Site header rows show site code, name, city/state, temperature, alert count, and highest severity badge
  - Alert sub-rows beneath each header show headline, advisory type, severity, action, source, and last updated
  - Header rows are clickable and navigate to site detail page
  - Severity-colored left border on header rows matches card view styling (red/orange/yellow/green)
  - Dedup toggle and all filters continue to work with grouped view
  - Summary stats now update correctly when filters change in table view

## [1.7.1] - 2026-02-22

### Changed
- **Total Impact Card** - Replaced "Low/No Impact" (green) card with "Total Impact" aggregate card in Weather Impact Assessment (closes #53)
  - Displays sum of High Impact + Severe Impact + Moderate Impact site counts
  - Navy-styled card using Prometric brand color (`--pm-navy`)
  - Links to `sites.html` showing all impacted sites
- **Weather Impact Card Order** - Reordered cards: Total Impact → High Impact → Severe Impact → Moderate Impact (closes #54)

## [1.7.0] - 2026-02-21

### Changed
- **Prometric Visual Alignment** - Updated color palette and design elements to align with Prometric brand identity
  - Added Prometric brand CSS variables: `--pm-navy` (#1B2845), `--pm-green` (#7AB648), `--pm-text` (#313131) (closes #41)
  - Navbar changed from Bootstrap black to deep navy across all 8 pages (closes #42)
  - Sticky update banner on dashboard changed to navy background (closes #43)
  - Body text color updated to Prometric charcoal #313131 (closes #44)
  - Section headings (h1-h4) now use deep navy tint (closes #45)
  - Primary buttons changed from Bootstrap blue to Prometric green; outline-primary buttons follow suit (closes #46)
  - All interactive accent colors in style.css updated from Bootstrap blue to navy/green variables (closes #47)
  - Tooltip hover/focus accents updated to navy in tooltips.css (closes #48)
  - Mobile focus-visible outline and skip-to-content updated to navy in mobile.css (closes #49)
  - Export report templates (incident, summary, executive) accent colors updated to navy (closes #50)
  - Footer changed from light gray to dark navy background with light text across all 8 pages (closes #51)
- Severity indicator colors (red/orange/yellow/green) intentionally unchanged — critical operational signals

## [1.6.4] - 2026-02-21

### Added
- **Dynamic Critical/Severe Count Color** - Summary stats bar on advisories page now shows count in red when Extreme alerts are present, orange when only Severe (closes #14)
- **Alert Headline on Site Cards** - NOAA alert headline displayed on each site card below advisory type, truncated to 120 chars (closes #15)
- **Temperature + Station Status on Site Cards** - Current temperature (°F/°C) from nearest NWS station shown on cards with relative timestamp; stations older than 90 minutes display "OFFLINE" in red (closes #16)
- **Temperature Column in Table View** - New Temp column between Site Code and Site Name in advisories table view (closes #17)
- **Headline Column in Table View** - New Headline column between Site Name and City in advisories table view, truncated to 80 chars (closes #18)
- **Celsius Added to Temperature** - All temperature displays now show °F / °C (closes #20, closes #21)
- **Temperature on Dashboard Cards** - index.html site cards now show temperature in header below severity badge (closes #22)
- **Headline on Dashboard Cards** - index.html site cards now show NOAA alert headline below advisory type (closes #23)
- **Temperature on Sites Cards** - sites.html cards restructured with city/state in header + temperature below severity badge (closes #24)
- **Headline on Sites Cards** - sites.html cards now show NOAA alert headline below advisory type (closes #25)
- **Observations API Client** - Added `getObservations()` to frontend `api.js` for fetching current weather data
- **Temperature on Site Detail** - site-detail.html header card now shows temperature (°F/°C) below severity badge with staleness detection (closes #29)
- **Temperature on Map Popup** - map.html popup card now shows temperature (°F/°C) right-justified on city/state line with staleness detection (closes #30)
- **Headline on Map Popup** - map.html popup card now shows NOAA alert headline below severity badge, truncated to 80 chars (closes #31)

### Fixed
- **Map Popup View Details Button** - Button text was invisible due to Leaflet CSS overriding Bootstrap button color; added specificity fix (closes #32)

### Changed
- **Temperature Moved to Card Header** - Temperature display relocated from card body to header right side, below severity badge (closes #19)
- **API Rate Limit Increased** - General API rate limit raised from 500 to 5000 requests per 15 minutes to support additional observations API calls across all pages (closes #28)
- **Map Popup Layout Reorganized** - Removed "Highest Alert:" label (closes #33); moved NOAA alert type to display directly below severity/status badges (closes #34); alert type now bold (closes #35); headline grouped below alert type (closes #36)
- **Summary Panel Label** - Renamed "Sites Impacted" to "Locations Impacted" on advisories page (closes #37)
- **Critical/Severe Count Split** - Summary panel now shows separate color-coded counts for Critical (red) and Severe (orange) separated by "/" instead of a single combined number (closes #38)
- **Table View Default Sort** - Table view on advisories page now sorted by site code ascending (lowest to highest) as default; filters still apply before sort (closes #39)
- **Dashboard Layout Reorder** - Moved Weather Impact Assessment to top of dashboard, directly below heading and above Sites Requiring Attention (closes #40)

### Removed
- **City/State from Sites Card Body** - Moved to card header for consistency with advisories.html (closes #26)
- **Ops Status Badge from Sites Cards** - Removed unimplemented "Ops: Unknown" badge (closes #27)

## [1.6.3] - 2026-02-20

### Fixed
- **Site Data Verification** - Verified all 9 new sites against physical addresses from operations
  - 0383 Irving, TX: Corrected coordinates to 4441 W Airport Fwy (was city-center fallback)
  - 0624 Miami, FL: Corrected coordinates to 6505 Waterford District Dr / Blue Lagoon (was city-center); UGC zone updated FLZ173 → FLZ074
  - 5298 Wichita Falls, TX: Corrected coordinates to 4701 Southwest Pkwy (was geocoded to wrong address)
  - 6752 NYC Downtown, NY: Corrected coordinates to 80 Maiden Lane (was city-center fallback)
  - 5 remaining sites (0313, 1908, 1910, 3700, 3702) verified with no changes needed

### Removed
- **Site 6753 (NYC Downtown Testing Center 2)** - Removed as child site of 6752
  - Both sites share same physical address (80 Maiden Lane, Suite 706, New York, NY 10038)
  - Storm Scout tracks parent site codes only; total sites: 230 → 229

### Data Sources
- Coordinates verified via US Census Geocoder against operations-provided physical addresses
- NOAA /points API used to re-verify UGC codes, CWA, and county for all corrected sites
- Miami alternate address (6505 Blue Lagoon Dr) used when Waterford District Dr not in Census database

## [1.6.2] - 2026-02-20

### Added
- **10 New Testing Centers** - Total sites increased from 220 to 230
  - 0313 Waco, TX (McLennan County, FWD)
  - 0383 Irving, TX (Dallas County, FWD)
  - 0624 Miami, FL (Miami-Dade County, MFL)
  - 1908 Santa Fe, NM (Santa Fe County, ABQ)
  - 1910 Albuquerque, NM (Bernalillo County, ABQ)
  - 3700 Billings, MT (Yellowstone County, BYZ)
  - 3702 Helena, MT (Lewis and Clark County, TFX)
  - 5298 Wichita Falls, TX (Wichita County, OUN)
  - 6752 NYC Downtown, NY (New York County, OKX)
  - 6753 NYC Downtown 2, NY (New York County, OKX)
  - Montana added as new state (2 sites, Mountain region)
  - All sites include UGC codes, CWA, and county data
- **Add New Sites Script** (`backend/src/scripts/add-new-sites.js`)
  - Geocodes addresses via US Census Geocoder / Nominatim
  - Fetches UGC codes, CWA, and county from NOAA /points API
  - Generates sites.json entries and production SQL INSERT statements
  - Includes verification report with warnings for unconfirmed addresses

### Data Sources
- Addresses sourced from Prometric public test center lists (NCSF, DSST, ISEE/ERB PDFs)
- Coordinates from US Census Geocoder (6 sites) and Nominatim/OSM (4 sites)
- Weather data from NOAA Weather API /points endpoint

## [1.6.1] - 2026-02-19

### Added
- **New Site: Concord, NH (5148)** - 220th testing center added
  - Location: 2 Whitney Rd, Concord, NH 03301
  - UGC Codes: NHZ008, NHC013 (Merrimack County)
  - Region: Northeast
- **CWA Field** - Added NWS County Warning Area office code to all sites
  - New `cwa` column in sites table (e.g., "IND", "GYX", "MFL")
  - Populated for all 220 sites from NOAA /points API data
  - Stored in sites.json for future seeding

### Changed
- **NWS Forecast Links** - Updated from lat/lon MapClick to CWA office URLs
  - Old: `https://forecast.weather.gov/MapClick.php?lat=X&lon=Y`
  - New: `https://www.weather.gov/{cwa}` (e.g., `https://www.weather.gov/ind`)
  - Provides operations team with direct access to regional NWS office pages
  - Links include local forecasts, active alerts, and radar for the region

## [1.6.0] - 2026-02-15

### Removed
- **Beta UI** - Temporarily removed from production due to UI/UX bugs
  - Removed "Try Beta UI" nav link from all 8 Classic HTML pages
  - Removed footer Beta badge from index.html
  - Removed floating "Try Beta" button (`ui-toggle.js`)
  - Deleted `/beta/` directory from production server
  - Beta files archived locally to `frontend/archive/beta-2026-02-15/`

### Fixed
- **Weather Impact Drill-Down** - Dashboard Weather Impact cards now correctly filter Sites page
  - Added `weather_impact_level` calculation from `highest_severity` (Extreme→red, Severe→orange, Moderate→yellow, Minor→green)
  - Fixed race condition: URL parameters now applied after data loads (was using 100ms timeout)
  - Fixed data source: Changed from `API.getImpactedSites()` (3 closed sites) to `API.getSites()` (all 219 sites)
  - Fixed key mismatch: Sites API uses `id`, advisories use `site_id`
- **Export Dropdown** - Disabled broken Advanced Reports buttons
  - Executive Briefing, Incident Report, Export CSV marked as "Coming Soon"
  - Print/Save PDF and Copy Shareable Link still functional
  - Removed dead reference to archived `ui-toggle.js`
- **Dead Script References** - Removed obsolete `ui-toggle.js` script tags from 5 HTML files
  - Affected: map.html, site-detail.html, sources.html, filters.html, advisories.html
  - Script was archived with Beta UI but references remained
- **Severity Group Color Alignment** - Sites Requiring Attention now matches Weather Impact colors
  - Changed from 3-tier to 4-tier grouping (one per severity level)
  - 🔴 EXTREME - High Impact (previously combined with Severe as "critical")
  - 🟠 SEVERE - Severe Impact (previously combined with Extreme as "critical")
  - 🟡 MODERATE - Moderate Impact (was "elevated" displayed with orange)
  - 🟢 MINOR - Low Impact (was "monitoring" displayed with yellow)
  - Fixes visual inconsistency where Moderate alerts appeared orange in site groups but yellow in Weather Impact

### Verified
- **Frontend/API Mismatch Audit** - Comprehensive analysis of all frontend files
  - All 7 active HTML pages verified against backend API endpoints
  - ID matching logic confirmed correct (`id` vs `site_id` handling)
  - No broken API calls or missing endpoints found
  - All XSS-protected `html` tagged templates in place
  - All CDN resources have SRI hashes

### Security
- **CSP Compliance** - Fixed all inline event handlers blocked by `script-src-attr 'none'`
  - Replaced `onclick` attributes with `addEventListener` across 15 HTML files
  - Used event delegation for dynamically generated content
  - All pages now fully compliant with Content Security Policy

### Changed
- **IMT Severity Alignment** - Severity now based on internal alert categories instead of NOAA's raw severity
  - CRITICAL category → Extreme (🔴 RED)
  - HIGH category → Severe (🟠 ORANGE)
  - MODERATE category → Moderate (🟡 YELLOW)
  - LOW/INFO category → Minor (🟢 GREEN)
  - Example: Winter Storm Watch now shows as Moderate/Yellow (was Severe/Orange from NOAA)
  - Ran one-time database migration to update 126 existing alerts to new severity values
  - Aligns with IMT operational practices
- **Default Alert Filters** - Reduced Site Default from 19 to 11 enabled alert types
  - Added to disabled list: Lake Effect Snow Warning, Lake Effect Snow Watch, High Wind Watch,
    Coastal Flood Watch, Lakeshore Flood Watch, Excessive Heat Watch, Hard Freeze Warning, Freeze Watch
  - Site Default now focuses on most operationally relevant alerts

## [1.5.0] - 2026-02-14

### Added
- **API Rate Limiting** - Protects against abuse and ensures fair usage
  - General API: 5000 requests per 15 minutes per IP
  - Write operations: 20 requests per 15 minutes per IP
  - Health checks exempt from rate limiting
  - Returns 429 Too Many Requests with retry info when exceeded
  - Standard rate limit headers in responses
  - File: `middleware/rateLimiter.js`

- **Input Validation** - All API endpoints now validate and sanitize inputs
  - New `express-validator` middleware for all routes
  - Validates query params: severity, state, limit, days, etc.
  - Validates route params: id must be positive integer
  - Sanitizes strings: trim whitespace, uppercase state codes
  - Type coercion with range limits (e.g., limit 1-100)
  - Consistent 400 error responses with field-level details
  - Files: `middleware/validate.js`, `validators/*.js`

- **In-Memory Caching** - Reduces database load on high-traffic endpoints
  - New `cache.js` utility module using node-cache
  - Cached endpoints with TTL:
    - `/api/status/overview` - 15 min (matches ingestion interval)
    - `/api/sites` - 1 hour (static site data)
    - `/api/sites/states` - 24 hours (rarely changes)
    - `/api/sites/regions` - 24 hours (rarely changes)
    - `/api/advisories/active` - 15 min
  - Cache automatically invalidated after NOAA ingestion
  - Only caches unfiltered requests (filtered requests bypass cache)
  - Logging for cache hits/misses: `[CACHE] HIT/MISS/SET`

### Performance
- Expected ~100x faster response times for cached endpoints (~5ms vs ~500ms)
- Reduced database connection usage during traffic spikes
- Minimal memory footprint (~100KB for all cached data)

### Technical
- Added `node-cache` dependency
- New file: `backend/src/utils/cache.js`
- Modified: `status.js`, `sites.js`, `advisories.js`, `noaa-ingestor.js`

## [1.4.1] - 2026-02-14

### Added
- **Beta UI Notices Page** - Created `frontend/beta/notices.html` with full Beta UI styling
  - Jurisdiction filter dropdown (Federal, State, County, City)
  - Dark mode and high contrast support
  - Mobile responsive design
- **Self-Hosted Inter Font** (BUG-PROD-009) - Removed Google Fonts CDN dependency
  - Downloaded InterVariable.woff2 from official rsms/inter repository
  - Created `beta/css/fonts.css` with @font-face declarations
  - Eliminates external CDN dependency that could break typography
- **Analytics**: Added `frontend/js/analytics.js` placeholder (tracking implementation left to deployer)
  - Enables visitor analytics and usage monitoring
  - Added to all 8 HTML pages: index, advisories, sites, site-detail, map, notices, filters, sources

### Fixed
- **Severity Validation** (BUG-PROD-002) - `normalizer.js` now defaults invalid/Unknown severity to "Minor"
  - Logs warning when invalid severity received from NOAA
  - Prevents "Unknown" severity from breaking UI filters
- **Database Constraint** (BUG-PROD-008) - Added CHECK constraint `chk_advisories_severity`
  - Enforces severity IN ('Extreme', 'Severe', 'Moderate', 'Minor') at database level
  - Prevents invalid data from entering the system

### Performance
- **Composite Index** (BUG-PROD-005) - Added `idx_advisories_status_severity`
  - Improves queries filtering by both status AND severity
  - API response time improved from 676ms to 535ms (21% faster)

### Technical
- Migration: `20260214-add-severity-constraint-and-index.sql`
- Updated `schema.sql` with new index and constraint
- Self-hosted Inter font (352KB) in `beta/fonts/`

## [1.4.0] - 2026-02-14

### Added
- **Historical Snapshot System** - Automatic capture of system-wide and per-site metrics
  - `system_snapshots` table for system-wide aggregates (severity counts, site statuses, advisory actions)
  - `advisory_history` table for per-site historical snapshots
  - Snapshots captured every 6 hours, retained for 3 days (12 snapshots)
  - Automatic cleanup of data older than 3 days
  - Transaction-safe capture with rollback on failure
- **Snapshot Scheduler** - Integrated with main ingestion scheduler
  - Initial snapshot runs 5 seconds after server start
  - Recurring snapshots every 6 hours
  - Error handling with webhook notifications
  - Failure tracking and alerting

### Fixed
- **Database Connection Pattern** - Standardized across all models
  - Fixed `db.query is not a function` errors in all model files
  - Removed incorrect `await getDatabase()` calls (10+ instances in advisory.js, 8+ in site.js, 5+ in notice.js)
  - Fixed `advisoryHistory.js` to use `getDatabase()` correctly (5 query methods)
  - Fixed `capture-historical-snapshot.js` pool.getConnection() usage
- **Site Status Column Mismatch** - Fixed INSERT/UPDATE logic in siteStatus.js
  - Resolved "Column count doesn't match value count" errors during weather ingestion
  - Fixed `decision_at` handling to use NULL default in INSERT, NOW() in UPDATE
  - All 219 sites now update correctly during ingestion cycles
- **Module Caching** - Resolved Passenger cache issues
  - Implemented proper stop.txt → restart.txt cycle for complete module reload
  - Zero errors in production after complete restart

### Changed
- **Operational Status Migration** - Completed conversion to 4-category system
  - Migrated all sites from legacy (Open, At Risk, Closed) to new system (open_normal, open_restricted, pending, closed)
  - Set decision tracking metadata for all migrated records
  - Result: 202 open_normal, 17 open_restricted sites

### Technical
- Added database indexes for snapshot tables (site_id, snapshot_time)
- Snapshot capture performance: ~2-3 seconds for all 219 sites
- All models now use consistent database connection pattern: `const db = getDatabase()`
- Improved error logging and troubleshooting capabilities

### Performance
- Minimal database impact from snapshots (optimized indexes)
- No performance degradation during ingestion
- Automatic cleanup prevents table bloat

### Documentation
- Added `HISTORICAL-SNAPSHOTS-DEPLOYMENT.md` with complete deployment details
- Documented troubleshooting steps for module caching issues
- Added verification queries and rollback procedures

## [1.3.2] - 2026-02-13

### Added
- **NOAA External Links** - Direct links to official NWS resources on site-detail.html
  - "NWS Forecast" button links to forecast.weather.gov with site's exact lat/lon coordinates
    - Shows local forecast with any active alerts/warnings for that location
  - "Radar Map" button links to radar.weather.gov national radar
  - Links appear on highest severity alert and all advisory cards
  - Opens in new tab with proper security attributes

## [1.3.1] - 2026-02-13

### Fixed
- **Card Behavior Consistency** - All cards across the site now behave predictably
  - Operational Status cards (index.html) are now static with no hover effects
  - Site cards on advisories.html and sites.html are fully clickable (entire card, not just title)
  - Impact Summary cards on site-detail.html are now static with no hover effects
  - Map summary stat cards now toggle severity filters when clicked
- **Weather Impact Count Fix** - GREEN count now correctly shows only sites with Minor advisories
  - Previously counted sites with no advisories as GREEN incorrectly

## [1.3.0] - 2026-02-13

### Added
- **Dashboard UX Overhaul** - Reorganized index.html following action-first dashboard pattern
  - Sites Requiring Attention moved to top (most actionable content first)
  - Sticky update banner with timestamps and site counts (visible while scrolling)
  - Quick action buttons: "View All Sites" and "Map View" for faster navigation
  - "All Clear" success message when no sites need attention
  - Enhanced footer with links to About/Sources and Filter Settings
- **Clickable Dashboard Cards** - All cards now link to filtered views
  - Site attention cards link to site detail page (entire card clickable)
  - Weather Impact cards (RED/ORANGE/YELLOW/GREEN) link to filtered sites list
  - New `weather_impact` URL parameter on sites.html for drill-down filtering
  - Filter banner shows active weather impact filter with clear button
- **5 New MODERATE Alerts Enabled by Default** - Site Default preset now shows 18/68 alert types
  - Winter Storm Watch
  - Winter Weather Advisory
  - Lake Effect Snow Warning
  - Tropical Storm Watch
  - High Surf Warning

### Changed
- **Page Layout Order** - Follows industry best practices for operational dashboards
  1. Sites Requiring Attention (action items)
  2. Weather Impact Assessment (situational awareness)
  3. Operational Status (secondary metrics)
  4. Detailed Statistics (collapsed for power users)
- **Removed "About Storm Scout" section** from dashboard body (moved to footer link)
- **Improved Mobile Responsiveness** - Weather/Status cards now use 2-column grid on mobile
- **Streamlined Status Cards** - Reduced padding for more compact display

### Fixed
- **Navigation Consistency** - All 8 HTML pages now have identical 7-item navigation
  - Removed duplicate "Sources" link from index.html
  - Added missing "Map View" link to notices.html, filters.html, sources.html

## [1.2.2] - 2026-02-13

### Fixed
- **Map View Filter Integration** - Map now respects user filter preferences from Filter Settings
  - Added `alert-filters.js` to map.html
  - Map markers now only display for sites with advisories matching active filters
  - Consistent filtering behavior across all pages (Overview, Advisories, Sites, Map)

## [1.2.1] - 2026-02-13

### Fixed
- **Alert Expiration Bug** - Alerts now properly marked as `expired` when `end_time` passes
  - Added `markExpiredByEndTime()` function to cleanup module
  - Ingestion now marks alerts as expired during each run if `end_time < NOW()`
  - Cleanup module calls `markExpiredByEndTime()` before removing old records
  - Fixes issue where 84+ alerts remained `active` despite expired `end_time`

## [1.2.0] - 2026-02-13

### Added
- **Alerting Module** (`alerting.js`) - Webhook notifications for ingestion/cleanup failures
  - Slack-formatted alerts with severity levels
  - Alert throttling to prevent spam (5 min minimum)
  - Support for ingestion failures, cleanup failures, and anomaly detection
- **Hierarchical Geo-Matching** - Improved site-to-alert matching precision
  - UGC code matching (most precise)
  - County-level matching (fallback)
  - State-level matching (least precise fallback)
- **Database Retry Logic** - Automatic retries for transient connection failures
- **API Rate Limiting** - 500ms minimum between NOAA API requests
- **API Retry with Backoff** - Exponential backoff for 429/5xx responses
- Advisory history table for trend analysis (`advisory_history`)
- New site fields: `county`, `ugc_codes` for precise geo-matching
- Scheduler status endpoint via `getSchedulerStatus()`

### Changed
- **Database Pool Configuration**
  - Increased connection limit to 20
  - Added queue limit (50) to prevent runaway connections
  - Added acquire/connect timeouts (10s each)
  - Keepalive delay increased to 30s
- **Ingestion Process**
  - Advisory creation and status updates now wrapped in transactions
  - Anomaly detection with automatic alerting for sites with >15 advisories
  - Improved logging and error handling
- **Unified Cleanup Module** - Consolidated 4 cleanup scripts into 1
  - Multiple modes: `full`, `vtec`, `event_id`, `expired`, `duplicates`
  - Batched deletes in chunks of 1000
  - Race condition handling with `SELECT ... FOR UPDATE`
  - Automatic alerting on cleanup failures
- **Schema Updated** - `schema.sql` now includes all production columns
  - VTEC fields: `vtec_code`, `vtec_event_id`, `vtec_action`, `vtec_event_unique_key`
  - Site status fields: `weather_impact_level`, `decision_by`, `decision_at`, `decision_reason`
  - New indexes for common query patterns

### Deprecated
- `cleanup-duplicates.js` - Now wraps unified cleanup module
- `cleanup-event-id-duplicates.js` - Now wraps unified cleanup module

### Fixed
- Default User-Agent no longer contains example email (now requires configuration)
- Race conditions in external_id population during cleanup
- Potential memory issues from unbounded connection queues

### Technical
- Added `withRetry()` utility function in database module
- Added `requestWithRetry()` in API client
- Added `enforceRateLimit()` for NOAA API calls
- Added `extractGeoFromAlert()` for hierarchical geo-matching
- Improved transaction handling in `noaa-ingestor.js`
- Scheduler now tracks consecutive failures and alerts appropriately

## [1.1.0] - 2026-02-13

### Added
- Update banner component showing last updated time and countdown to next update
- Update banner deployed to all pages (index, advisories, sites, notices, filters, sources)
- Comprehensive documentation in `docs/` directory
  - `docs/deployment.md` - Production deployment procedures with SSH best practices
  - `docs/api.md` - Complete API documentation emphasizing API layer usage
  - `docs/vtec-implementation.md` - VTEC deduplication system documentation
- ROADMAP.md outlining future improvements and priorities
- CHANGELOG.md for tracking project history
- GitHub issue templates for bug reports, feature requests, and technical debt

### Changed
- Standardized deployment documentation with current production setup
- Documented rationale for SSH over FTP deployment approach
- Emphasized best practice of using API endpoints instead of direct database queries

### Documentation
- Added deployment checklists and verification procedures
- Documented database migration workflows
- Added troubleshooting guides for common issues
- Documented security and backup best practices
- Added VTEC system implementation details and benefits

## [1.0.0] - 2026-02-12

### Added
- VTEC (Valid Time Event Code) event ID deduplication system
- `vtec_event_id` column to advisories table for persistent event tracking
- `vtec_action` column to capture alert lifecycle status (NEW, CON, EXT, etc.)
- Generated column `vtec_event_unique_key` for database-level deduplication
- VTEC action badge display on advisories page with color coding
- Action code tooltips showing status meanings
- Migration scripts for backfilling VTEC data
- Cleanup scripts for removing duplicate events

### Changed
- Advisory deduplication now based on VTEC event ID instead of full VTEC string
- Status column on advisories page renamed to "Action" column
- Database unique constraint updated to use event ID

### Fixed
- Eliminated ~40 duplicate weather alerts across system
- Site 219 (Anchorage) reduced from ~30 to 25 unique alerts
- All VTEC events now properly deduplicated while preserving action history

### Technical
- Added `extractVTECEventID()` function in normalizer.js
- Added `extractVTECAction()` function in normalizer.js
- Updated Advisory model with `findByVTECEventID()` method
- Updated `createOrUpdate()` logic to use event ID for UPSERT operations
- Added indexes for performance: `idx_vtec_event_id`, `idx_vtec_action`

## [0.9.0] - 2026-02-11

### Added
- Alert filtering system with 68 NOAA alert types categorized by impact level
- 5 impact levels: CRITICAL, HIGH, MODERATE, LOW, INFO
- Custom filter configuration UI at `/filters.html`
- 5 filter presets: Site Default, Operations View, Executive Summary, Safety Focus, Full View
- Persistent filter preferences using localStorage
- Real-time advisory count recalculation based on active filters
- Filter-aware display across all dashboard pages

### Changed
- Overview counts now respect user filter preferences (client-side calculation)
- Sites impacted page filters advisories based on user preferences
- Improved filter UI with visual feedback (green borders for enabled, gray for disabled)

### Technical
- Created `alert-filters.js` shared module for filter logic
- Added `/api/filters` endpoint for filter presets
- Added `/api/filters/types/all` endpoint for alert type taxonomy
- Implemented `AlertFilters` JavaScript object for frontend filter management

## [0.8.0] - 2026-02-10

### Added
- 219 US testing center locations across all 50 states and territories
- Real-time NOAA weather data ingestion every 15 minutes
- Automated advisory cleanup removing expired alerts
- Operational status calculation (Open/Closed/At Risk) based on severity
- Sites impacted page showing facilities affected by weather
- Government/local notices page (placeholder for future state/local data)

### Changed
- Improved site matching algorithm for weather alerts
- Enhanced severity-based status determination

## [0.7.0] - 2026-02-09

### Added
- Bootstrap 5.3 responsive dashboard UI
- Six dashboard pages: Overview, Active Advisories, Sites Impacted, Notices, Filters, Sources
- Navigation bar with active page highlighting
- Consistent page layout and styling
- Loading indicators for async data fetching

### Technical
- Created `api.js` frontend module for API client
- Created `utils.js` for shared utility functions
- Implemented responsive design with Bootstrap grid system

## [0.6.0] - 2026-02-08

### Added
- REST API with Express.js
- `/api/status/overview` endpoint for dashboard statistics
- `/api/advisories/active` endpoint for current advisories
- `/api/sites` endpoint for testing center locations
- `/api/status/sites-impacted` endpoint for affected facilities
- `/api/notices/active` endpoint for government notices
- CORS configuration for cross-origin requests

### Technical
- Express routing structure
- MySQL/MariaDB database models
- Database connection pooling with mysql2

## [0.5.0] - 2026-02-07

### Added
- MySQL/MariaDB database schema
- Three main tables: sites, advisories, notices
- Database initialization scripts
- Seed data for 219 US testing centers
- Unique indexes on external IDs to prevent duplicates

### Technical
- Database migrations via SQL scripts
- UPSERT operations for advisory ingestion
- Foreign key relationships between sites and advisories

## [0.4.0] - 2026-02-06

### Added
- NOAA Weather API integration
- Alert fetching by state
- VTEC code extraction from CAP alerts
- Alert normalization and standardization
- Duplicate detection using external IDs

### Technical
- axios for HTTP requests
- node-cron for scheduled ingestion
- Custom NOAA API client with proper User-Agent

## [0.3.0] - 2026-02-05

### Added
- Backend project structure with src/ organization
- Configuration management with dotenv
- Ingestion scheduling with node-cron
- Basic logging infrastructure

## [0.2.0] - 2026-02-04

### Added
- Frontend project structure
- Static HTML pages for all views
- CSS styling with Bootstrap
- JavaScript modules for API interaction

## [0.1.0] - 2026-02-03

### Added
- Initial project setup
- README.md with project description
- Package.json for backend dependencies
- Git repository initialization
- MIT License

---

## Version Numbering

- **Major version (X.0.0)**: Breaking changes or major new features
- **Minor version (0.X.0)**: New features, backward compatible
- **Patch version (0.0.X)**: Bug fixes and small improvements

## Types of Changes

- **Added**: New features
- **Changed**: Changes to existing functionality
- **Deprecated**: Features that will be removed in future versions
- **Removed**: Features removed in this version
- **Fixed**: Bug fixes
- **Security**: Security vulnerability fixes
- **Technical**: Internal/technical changes not visible to users
- **Documentation**: Documentation-only changes

## Links

- [Production Site](https://your-deployment.example.com)
- [GitHub Repository](https://github.com/404-nullsignal/storm-scout)
- [Issue Tracker](https://github.com/404-nullsignal/storm-scout/issues)
- [Roadmap](./ROADMAP.md)
