# Storm Scout API Documentation

Backend REST API for the Storm Scout weather advisory system.

## Base URL

**Local Development**: `http://localhost:3000/api`
**Production**: Update when USPS production server is configured.

---

## Endpoints

### Health

#### GET `/health`

System health check — database connectivity, ingestion state, data integrity.

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

Get all 300 USPS office locations.

**Response**:
```json
{
    "success": true,
    "count": 300,
    "data": [
        {
            "id": 1,
            "office_code": "99501",
            "name": "Anchorage Main Post Office",
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
- `office_code`: 5-digit USPS zip code (primary identifier)
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
            "name": "Anchorage Main Post Office",
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

Get all currently active weather advisories.

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
            "office_name": "Anchorage Main Post Office",
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
- `CUSTOM`: Site Default (47/94 types — CRITICAL + HIGH + select MODERATE)
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

### Utilities

#### GET `/api/version`

Current application version from `package.json`.

```json
{ "version": "1.9.0", "releasedDate": "2026-03-08" }
```

---

## Frontend API Client

Located at `frontend/js/api.js`. Key methods:

```javascript
API.getOffices()                        // GET /api/offices
API.getImpactedOffices()               // GET /api/status/offices-impacted
API.getOverview()                       // GET /api/status/overview
API.getActiveAdvisories()              // GET /api/advisories/active
API.getOfficeTrend(officeId, days)     // GET /api/history/office-trends/:id
API.getActiveNotices()                  // GET /api/notices/active
API.getFilters()                        // GET /api/filters
API.getAllAlertTypes()                   // GET /api/filters/types/all
```

---

## Error Responses

All endpoints return standard HTTP status codes:

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad request / invalid parameters |
| 404 | Resource not found |
| 429 | Rate limit exceeded (500 req/15 min) |
| 500 | Internal server error |
| 503 | DB pool exhausted — retry after 5 seconds (`Retry-After: 5` header set) |

Error body:
```json
{ "success": false, "error": "Error message description" }
```

---

## Rate Limiting

- **General endpoints**: 30,000 requests / 60 minutes (corporate NAT-aware; configurable via `RATE_LIMIT_API_MAX`)
- **Write operations**: 20 requests / 15 minutes

`X-Data-Age` header is included on all `/api/*` responses — seconds since last successful NOAA ingestion.

---

**Last Updated**: March 10, 2026
**API Version**: 1.9.7
