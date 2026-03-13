# Storm Scout API Documentation

Backend REST API for the Storm Scout weather advisory system.

## Base URL

**Local Development**: `http://localhost:3000/api`
**Production**: Update when production server is configured.

---

## Endpoints

### Health

#### GET `/ping`
Liveness probe with no database I/O. Used by process supervisors (PM2, Passenger) for keep-alive checks. Always returns 200 if the Node.js process is running.

**Response:**
```json
{ "status": "ok" }
```
Note: Use `/health` for readiness checks — `/ping` does not verify database connectivity.

#### GET `/health`

Public liveness probe — returns database connectivity status only. For detailed diagnostics (memory, circuit breaker, ingestion), use the authenticated `GET /api/admin/health` endpoint.

**Response**:
```json
{
    "status": "ok",
    "timestamp": "2026-03-10T14:00:00.000Z"
}
```

Returns HTTP 200 if healthy, HTTP 503 if degraded (database unreachable).

#### GET `/api/admin/health` _(requires API key)_

Detailed health diagnostics — database, ingestion freshness, data integrity, memory, circuit breaker state.

**Response**:
```json
{
    "status": "ok",
    "timestamp": "2026-03-10T14:00:00.000Z",
    "environment": "production",
    "uptime": { "seconds": 86400, "human": "24h 0m 0s" },
    "memory": { "heapUsedMb": 112, "heapTotalMb": 180, "rssMb": 210, "externalMb": 3 },
    "noaaCircuitBreaker": { "state": "CLOSED", "failureCount": 0, "lastFailureTime": null, "recoveryTimeMs": 60000 },
    "checks": {
        "database": { "status": "ok", "message": "Database connection successful" },
        "ingestion": { "status": "ok", "lastUpdated": "2026-03-10T13:45:00.000Z", "minutesAgo": 15, "message": "Ingestion is current" },
        "data_integrity": { "status": "ok", "message": "All offices have valid UGC codes and county data" }
    },
    "ingestion": { "active": false, "startedAt": null }
}
```

**Circuit breaker states**: `CLOSED` (normal), `OPEN` (NOAA unreachable — requests rejected), `HALF_OPEN` (testing recovery)

---

### Overview & Status

#### GET `/api/status/overview`

Dashboard summary statistics.

**Response**:
```json
{
    "success": true,
    "data": {
        "total_offices": 300,
        "offices_with_advisories": 38,
        "total_active_advisories": 48,
        "advisories_by_severity": [
            { "severity": "Severe", "count": 16 },
            { "severity": "Moderate", "count": 16 },
            { "severity": "Minor", "count": 16 }
        ],
        "operational_status_counts": [...],
        "weather_impact_counts": [...]
    }
}
```

**Notes**:
- Frontend applies filter preferences to counts client-side after receiving this response
- `offices_with_advisories`: offices matched to at least one active NOAA alert

---

### Offices

#### GET `/api/offices`

Get all 300 office locations.

**Response**:
```json
{
    "success": true,
    "count": 300,
    "data": [
        {
            "id": 1,
            "office_code": "99501",
            "name": "Downtown Anchorage",
            "city": "Anchorage",
            "state": "AK",
            "latitude": 61.2181,
            "longitude": -149.9003,
            "region": "Alaska",
            "county": "Anchorage Municipality",
            "ugc_codes": ["AKZ104"],
            "cwa": "PAFC"
        }
    ]
}
```

**Notes**:
- `office_code`: 5-digit zip code (primary identifier)
- `ugc_codes`: NWS Universal Geographic Code zones — used for precise alert geo-matching
- `cwa`: NWS County Warning Area code

#### GET `/api/status/offices-impacted`

Get offices currently impacted by weather advisories (Closed or At Risk status).

**Response**:
```json
{
    "success": true,
    "data": [
        {
            "id": 1,
            "office_code": "99501",
            "name": "Downtown Anchorage",
            "city": "Anchorage",
            "state": "AK",
            "operational_status": "closed",
            "weather_impact_level": "red",
            "reason": "Blizzard Warning in effect",
            "advisory_count": 3
        }
    ]
}
```

**Fields**:
- `operational_status`: `open_normal` | `open_restricted` | `pending` | `closed`
- `weather_impact_level`: `green` | `yellow` | `orange` | `red` (set automatically by ingestion)
- `reason`: Human-readable explanation for status

---

### Advisories

#### GET `/api/advisories/active`

Get all currently active weather advisories. Supports `?page=N&limit=N` pagination; returns full dataset by default for backward compatibility.

**Query Parameters** (all optional):
- `severity` — comma-separated: `Extreme`, `Severe`, `Moderate`, `Minor`
- `state` — two-letter state code (e.g. `FL`)
- `advisory_type` — alert type name (e.g. `Tornado Warning`)
- `page` — page number (default: 1); only applies when `limit` is set
- `limit` — results per page (max 200); omit for full dataset (default behaviour)

**Caching**: Unfiltered requests cached 15 min server-side. Filtered requests cached 5 min. Paginated requests bypass cache.

**Response**:
```json
{
    "success": true,
    "data": [
        {
            "id": 123,
            "office_id": 1,
            "office_code": "99501",
            "office_name": "Downtown Anchorage",
            "city": "Anchorage",
            "state": "AK",
            "source": "NOAA/NWS",
            "advisory_type": "Blizzard Warning",
            "headline": "Blizzard Warning until 6 PM AKST",
            "description": "Heavy snow and strong winds...",
            "severity": "Extreme",
            "urgency": "Immediate",
            "certainty": "Likely",
            "effective": "2026-03-08T10:00:00.000Z",
            "end_time": "2026-03-09T02:00:00.000Z",
            "last_updated": "2026-03-08T14:00:00.000Z",
            "external_id": "urn:oid:2.49.0.1.840.0.abc123",
            "vtec_code": "/O.NEW.PAJK.BZ.W.0006.260308T1000Z-260309T0200Z/",
            "vtec_event_id": "PAJK.BZ.W.0006",
            "vtec_action": "NEW"
        }
    ]
}
```

**VTEC Action Codes**:
- `NEW`: New alert issued
- `CON`: Alert continuing
- `EXT`: Alert time extended
- `UPG`: Alert upgraded in severity
- `EXP`: Alert expired
- `CAN`: Alert cancelled
- `COR`: Correction issued

**Paginated response** (when `limit` is specified):
```json
{
    "success": true,
    "data": [...],
    "count": 50,
    "total": 312,
    "pages": 7,
    "page": 1,
    "limit": 50
}
```

#### GET `/api/advisories/:id`

Get a single advisory by ID.

#### GET `/api/advisories/recent`

Get recently updated advisories (last 24 hours).

#### GET `/api/advisories/stats`

Aggregate advisory statistics by severity, state, and type.

---

### Trends

#### GET `/api/trends`

Advisory trend data for all offices that have advisory history. Enriched with office details.

**Query Parameters**:
- `days` — number of days of history (default: 7)

**Response**: Array of trend objects for all offices (uses `getAllTrends()` vocabulary):

> **Note on trend vocabulary:** The bulk endpoint uses `"increasing"` / `"decreasing"` / `"stable"` to describe advisory count direction. The per-office endpoint (`/api/trends/:officeId`) uses `"worsening"` / `"improving"` / `"stable"` to describe severity direction. These are two different analytical methods.

```json
[
    {
        "office_id": 1,
        "trend": "increasing",
        "first_count": 1,
        "last_count": 3,
        "data_points": 4,
        "office": {
            "id": 1,
            "office_code": "99501",
            "name": "Downtown Anchorage",
            "city": "Anchorage",
            "state": "AK"
        }
    }
]
```

#### GET `/api/trends/:officeId`

Advisory trend data for a specific office by numeric office ID.

**Query Parameters**:
- `days` — number of days of history (default: 7)

**Response**:
```json
{
    "office_id": 1,
    "trend": "worsening",
    "severity_change": 1,
    "advisory_change": 2,
    "first_severity": "Moderate",
    "last_severity": "Severe",
    "first_count": 1,
    "last_count": 3,
    "duration_hours": 6,
    "history": [...],
    "office": {
        "id": 1,
        "office_code": "99501",
        "name": "Downtown Anchorage",
        "city": "Anchorage",
        "state": "AK"
    }
}
```

#### GET `/api/trends/:officeId/history`

Full advisory history snapshots for a specific office.

**Query Parameters**:
- `days` — number of days (default: 7)

**Response**:
```json
{
    "office": { ... },
    "history": [...]
}
```

---

### Observations

#### GET `/api/observations`

Current weather observations for all offices with mapped NWS stations.

**Response** (per office):
```json
{
    "office_code": "99501",
    "temperature_f": 14.2,
    "humidity": 72,
    "wind_speed_mph": 18,
    "wind_direction": "NW",
    "wind_gust_mph": 28,
    "pressure_mb": 1008.4,
    "visibility_miles": 2.5,
    "description": "Blowing Snow",
    "observed_at": "2026-03-08T21:50:00.000Z",
    "station_id": "PANC"
}
```

#### GET `/api/observations/:officeCode`

Current observation for a specific office by zip code.

---

### Government Notices

#### GET `/api/notices/active`

Active government and emergency notices (state/federal declarations).

**Response**:
```json
[
    {
        "id": 1,
        "title": "State of Emergency Declared",
        "jurisdiction": "Alaska",
        "jurisdiction_type": "State",
        "notice_type": "Emergency Declaration",
        "description": "Governor declares state of emergency...",
        "effective_time": "2026-03-08T00:00:00.000Z",
        "expiration_time": "2026-03-15T00:00:00.000Z",
        "affected_states": "AK",
        "source_url": "https://gov.alaska.gov/..."
    }
]
```

**Jurisdiction Types**: `Federal`, `State`, `County`, `City`

---

### Filters

#### GET `/api/filters`

Available filter presets for alert type filtering.

**Available Presets**:
- `CUSTOM`: Office Default (47/94 types — CRITICAL + HIGH + select MODERATE)
- `OPERATIONS`: Operations View (CRITICAL + HIGH only)
- `EXECUTIVE`: Executive Summary (highest impact only)
- `SAFETY`: Safety Focus (life-safety alerts)
- `FULL`: Full View (all 94 types)

#### GET `/api/filters/types/all`

All 94 NOAA alert types grouped by impact level (`CRITICAL`, `HIGH`, `MODERATE`, `LOW`, `INFO`).

---

### History & Trends

#### GET `/api/history/office-trends/:officeId`

Advisory trend for a specific office over the last N days.

**Query params**: `?days=7` (default 7)

**Response**:
```json
{
    "trend": "worsening",
    "severity_change": 1,
    "advisory_change": 2,
    "first_severity": "Moderate",
    "last_severity": "Severe",
    "first_count": 1,
    "last_count": 3,
    "duration_hours": 6,
    "history": [...]
}
```

---

### Admin

All admin endpoints require the `X-Api-Key` header with a valid API key.

**Example request header**: `X-Api-Key: <your-api-key>`

#### POST `/api/admin/pause-ingestion`

Stops the ingestion scheduler and waits for any active ingestion cycle to complete (up to 60s). Returns 200 when idle, 409 if already paused, 503 if the active cycle does not settle within the timeout. Used by `deploy.sh` before rsync.

**Responses**:
- `200` — ingestion paused successfully
- `409` — ingestion already paused
- `503` — active ingestion cycle did not complete within the 60s timeout

#### POST `/api/admin/resume-ingestion`

Restarts the ingestion scheduler. Returns 200. Idempotent — safe to call even if ingestion is already running.

**Response**: `200`

#### GET `/api/admin/status`

Returns current scheduler state.

**Response**:
```json
{
    "ingestion": {
        "running": true,
        "inProgress": false,
        "consecutiveFailures": 0,
        "intervalMinutes": 15
    },
    "snapshot": {
        "running": true,
        "inProgress": false,
        "consecutiveFailures": 0,
        "intervalHours": 6
    }
}
```

**Fields**:
- `ingestion.running`: whether the ingestion scheduler is active
- `ingestion.inProgress`: whether an ingestion cycle is currently running
- `ingestion.consecutiveFailures`: consecutive failed ingestion cycles; alert if > 0
- `ingestion.intervalMinutes`: configured ingestion interval (default: 15)
- `snapshot.running`: whether the advisory history snapshot scheduler is active
- `snapshot.inProgress`: whether a snapshot is currently being captured
- `snapshot.consecutiveFailures`: consecutive failed snapshot cycles
- `snapshot.intervalHours`: snapshot interval (always 6)

---

### Utilities

#### GET `/api/version`

Current application version from `package.json`.

```json
{ "version": "2.0.0", "releasedDate": "2026-03-13" }
```

---

## Frontend API Client

Located at `frontend/js/api.js`. Key methods:

```javascript
API.getOffices()                        // GET /api/offices
API.getImpactedOffices()               // GET /api/status/offices-impacted
API.getOverview()                       // GET /api/status/overview
API.getActiveAdvisories()              // GET /api/advisories/active
API.getTrends(days)                     // GET /api/trends
API.getOfficeTrend(officeId, days)     // GET /api/trends/:id
API.getOfficeHistory(officeId, days)   // GET /api/trends/:id/history
API.getActiveNotices()                  // GET /api/notices/active
API.getFilters()                        // GET /api/filters
API.getAllAlertTypes()                   // GET /api/filters/types/all
```

---

## Response Envelopes

### Standard response
```json
{ "success": true, "data": [...], "count": 42 }
```

### Paginated response
Returned by `GET /api/advisories/active?page=N&limit=N`:
```json
{
  "success": true,
  "data": [...],
  "count": 25,
  "total": 342,
  "pages": 14,
  "page": 2,
  "limit": 25
}
```

### Error response
```json
{ "success": false, "error": "Description of what went wrong" }
```

### HTTP 503 — connection pool exhausted
```json
{ "success": false, "error": "Service temporarily unavailable" }
```
Response includes `Retry-After: 5` header. Retry after 5 seconds.

### HTTP 429 — rate limit exceeded
Response includes `Retry-After` header indicating when the window resets.

---

## Rate Limiting

Three rate limit tiers are applied independently:

| Tier | Limit | Window | Applies to | Configurable |
|------|-------|--------|------------|--------------|
| General | 30,000 requests | 60 minutes | All `/api/*` routes | `RATE_LIMIT_API_MAX` env var |
| Write | 20 requests | 15 minutes | `/api/operational-status` write endpoints | `RATE_LIMIT_WRITE_MAX` env var |
| Admin | API key required | — | `/api/admin/*` | — |

The general limit of 30,000 req/60 min is designed to accommodate corporate NAT environments where many users share a single IP address (equivalent to ~500 req/min). When the limit is exceeded, the API returns HTTP 429 with a `Retry-After` header.

---

## Error Responses

All endpoints return standard HTTP status codes:

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad request / invalid parameters |
| 404 | Resource not found |
| 429 | Rate limit exceeded |
| 500 | Internal server error |
| 503 | DB pool exhausted — retry after 5 seconds (`Retry-After: 5` header set) |

Error body:
```json
{ "success": false, "error": "Error message description" }
```

`X-Data-Age` header is included on all `/api/*` responses — seconds since last successful NOAA ingestion.

---

**Last Updated**: March 10, 2026
**API Version**: 2.0.0
