# Storm Scout — Architecture & Scale Considerations

**Last Updated:** 2026-03-10
**Current Production Scale:** 300 locations

---

## System Overview

Storm Scout is a Node.js + Express API backend paired with a Bootstrap 5.3 static frontend. It ingests NOAA weather advisories every 15 minutes, matches them to office locations by UGC zone/county codes, and surfaces operational impact through a browser-based dashboard.

```
NOAA Weather API
      │
      ▼
 noaa-ingestor.js  (15-min cron, UGC matching, dedup, VTEC parsing)
      │
      ▼
MySQL/MariaDB  ◄──── advisory_history snapshots (6-hr cron)
      │
      ▼
Express REST API  (cached, rate-limited, gzip-compressed)
      │
      ▼
Bootstrap 5.3 Frontend  (client-side filter/sort/aggregate over full dataset)
```

---

## Current Tested Scale

| Resource | Current | Notes |
|----------|---------|-------|
| Office locations | 1373 | All 50 states + territories |
| Active advisories (peak) | ~800–1,200 | Per 15-min ingestion cycle |
| DB connection pool | 40 | Configurable via `DB_POOL_LIMIT` |
| API response (full advisory list) | ~80 KB gzipped | ~500 KB raw |
| Client-side localStorage cache TTL | 5 min | Advisories, overview, observations |
| Ingestion cycle duration | ~8–15s | Depends on NOAA API latency |

---

## Scale Ceilings by Component

The system is designed and tested for 300 locations. The following table documents implicit scale ceilings — points where a specific component will degrade or require architectural work before scaling further.

### UI / Frontend

| Component | Current approach | Ceiling | Risk at ceiling |
|-----------|-----------------|---------|-----------------|
| Advisory list (`advisories.html`) | Full dataset fetched client-side; filtered in JS | ~2,000 advisories before noticeable render lag | Client memory and DOM re-render time grow linearly |
| Offices list (`offices.html`) | Full 300-office list in memory | ~1,000 offices | Acceptable; search is debounced but re-renders all visible rows |
| Map (`map.html`) | `leaflet.markercluster` groups markers | ~5,000 markers before cluster performance degrades | Cluster calculation is O(n log n); acceptable to ~3,000 |
| Update countdown | Single-page `setInterval` | No ceiling | N/A |
| localStorage preferences | Single JSON blob | No ceiling | N/A |

**Recommended fix at ~500 locations:** The API endpoint `GET /api/advisories/active` already supports `?page=N&limit=N` (max `limit=200`; paginated responses include `{ total, pages, page, limit }` envelope). The frontend currently fetches the full dataset in one call — switching the list view to consume paginated responses is the required frontend-side change, not a backend change.

### Backend / API

| Component | Current approach | Ceiling | Risk at ceiling |
|-----------|-----------------|---------|-----------------|
| `getAllTrends()` | Single SQL query + O(n) JS grouping (post-#105 fix) | ~10,000 history rows/query | Acceptable; further growth requires index tuning or partitioning |
| `getImpacted()` | Derived-table LEFT JOIN (post-#107 fix) | No practical ceiling at 300 offices | Well-optimized |
| Ingestion cycle | Sequential per-office UGC matching | ~500 offices before cycle exceeds 30s | NOAA API rate limits (500ms between calls) are the primary constraint |
| Connection pool | 40 connections (configurable) | Governed by MariaDB `max_connections` | Raise `DB_POOL_LIMIT` and verify `SHOW VARIABLES LIKE 'max_connections'` before scaling |
| Rate limiter | 30,000 req/60 min per IP (default; configurable via `RATE_LIMIT_API_MAX` env var) | Accommodates corporate NAT environments where many users share one IP | N/A |
| In-memory cache | node-cache (single process) | No inter-process cache sharing | Becomes stale if multiple Node processes run (not current architecture) |

### Database

| Component | Current approach | Ceiling | Risk at ceiling |
|-----------|-----------------|---------|-----------------|
| `advisories` table | InnoDB, no partitioning | ~5M rows before query plans degrade without partitioning | `idx_advisories_status_time` index covers common queries well to this range |
| `advisory_history` table | InnoDB, no partitioning; 30-day TTL cleanup | ~500K rows (300 offices × 4 snapshots/day × 30 days = 36K rows/month) | Safe at current scale; partition by month at ~300K rows/month |
| `offices` table | Full table scan acceptable | No ceiling at 1640 | Static data; cached aggressively |
| Backup strategy | Not automated | Any scale | See Planned work below |

**Recommended partition threshold:** Run `SELECT COUNT(*) FROM advisory_history` periodically. When row count exceeds 200,000, add time-based partitioning to enable fast partition pruning on time-range queries.

> **MariaDB syntax** (this project uses MariaDB/MySQL — syntax differs from PostgreSQL):
> ```sql
> ALTER TABLE advisory_history
>   PARTITION BY RANGE (YEAR(snapshot_time) * 100 + MONTH(snapshot_time)) (
>     PARTITION p_initial VALUES LESS THAN (202601)
>   );
> ```
> Add one `PARTITION ... VALUES LESS THAN (YYYYMM)` clause per month as needed. Confirm engine support with `SHOW VARIABLES LIKE 'have_partitioning'` before running.

### Infrastructure

| Component | Current approach | Ceiling | Risk at ceiling |
|-----------|-----------------|---------|-----------------|
| Node.js process | Single process (Passenger or PM2) | CPU-bound at high ingestion frequency | Add PM2 cluster mode or move ingestion to a separate worker process |
| NOAA API | 500ms per-request rate limiting, circuit breaker | NOAA enforces no published rate limit; 500ms is conservative | Monitor for 429 responses and adjust `NOAA_REQUEST_DELAY_MS` |
| Disk (logs) | PM2 with `pm2-logrotate` | Unbounded without rotation | `pm2 install pm2-logrotate` is required on the server (one-time setup) |

---

## Recommended Re-Evaluation Threshold

**Trigger a scale review when any of the following occur:**

1. **Location count reaches 500** — ingestion cycle may approach 30s; switch to parallel UGC matching batches.
2. **`advisories` row count exceeds 2M** — review index health and consider table partitioning.
3. **`advisory_history` row count exceeds 200K** — add time-based partitioning.
4. **API p95 response time exceeds 500ms** — profile cache hit rates and connection pool utilization.
5. **Client-side advisory list render exceeds 1s** — enable server-side pagination in the frontend.

---

## Components Requiring Work Before Scaling Beyond 500 Locations

The following are the **minimum required changes** before operating at >500 locations reliably:

| Priority | Component | Required change |
|----------|-----------|----------------|
| P0 | Ingestion cycle | Parallelize UGC matching; currently sequential with 500ms delays |
| P0 | Client-side advisory list | Consume server-side pagination instead of full-dataset fetch |
| P1 | `advisory_history` table | Add time-based partitioning |
| P1 | In-memory cache | Evaluate shared cache (Redis) if multiple Node processes are introduced |
| P2 | `advisories` table | Partition by status + time to improve expiration query performance |
| P2 | DB connection pool | Tune `DB_POOL_LIMIT` based on actual MariaDB `max_connections` headroom |
| P3 | Map clustering | Already implemented (leaflet.markercluster); validate at 500+ pins |

---

## Planned Architectural Work

These items are tracked in the `[Unreleased]` section of `CHANGELOG.md` and are **not yet implemented**:

- **Global alert sources** — Adapter pattern for ECCC (Canada), MeteoAlarm (EU), SMN (Mexico)
- **Historical data API endpoints** — Expose `advisory_history` trend data via REST
- **Trend visualization** — Dashboard charts for historical advisory patterns
- **Database backup automation** — Scheduled MariaDB dumps with retention policy
- **Predictive analytics** — ML-based impact forecasting from historical patterns

---

## Backup & Recovery

### Strategy

Daily automated MariaDB/MySQL dumps via `deployment/backup.sh`, compressed with gzip, rotated after 30 days. Verification via `deployment/verify-backup.sh` restores to a temporary database and runs smoke tests against core tables.

### RTO / RPO Targets

| Metric | Target | Notes |
|--------|--------|-------|
| **RPO** (Recovery Point Objective) | 24 hours | Daily backups; acceptable data loss is one day of ingestion (re-ingestible from NOAA) |
| **RTO** (Recovery Time Objective) | 1 hour | Restore from latest dump + re-run ingestion to fill the gap |

### Backup Scheduling

```
# Example cron entry (daily at 2 AM)
0 2 * * * /path/to/deployment/backup.sh >> /var/log/storm-scout-backup.log 2>&1

# Weekly verification (Sunday at 4 AM)
0 4 * * 0 /path/to/deployment/verify-backup.sh >> /var/log/storm-scout-verify.log 2>&1
```

### Recovery Procedure

1. Stop the application: `pm2 stop storm-scout`
2. Restore: `gunzip -c backup.sql.gz | mariadb storm_scout`
3. Run migrations: `npm run migrate`
4. Start the application: `pm2 start storm-scout`
5. Trigger immediate ingestion: `npm run ingest`

---

## Key File Index

| File | Purpose |
|------|---------|
| `backend/src/ingestion/noaa-ingestor.js` | Main ingestion pipeline; UGC matching, dedup, VTEC |
| `backend/src/ingestion/scheduler.js` | Cron scheduling; concurrency guards; alerting hooks |
| `backend/src/config/database.js` | MySQL pool config; statement timeout; retry logic |
| `backend/src/models/advisory.js` | Advisory CRUD; three-layer dedup (external_id, VTEC, natural key) |
| `backend/src/models/advisoryHistory.js` | Trend snapshots; single-query `getAllTrends()` |
| `backend/src/routes/admin.js` | Operational control endpoints (pause/resume ingestion) |
| `frontend/js/page-map.js` | Leaflet map; markercluster; severity-aware cluster icons |
| `frontend/js/alert-filters.js` | 94-type NOAA filter taxonomy; localStorage persistence |
| `backend/src/data/schema.sql` | Full DB schema; index rationale; FK constraint notes |
