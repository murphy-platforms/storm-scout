# Storm Scout API Documentation

Backend REST API for Storm Scout weather advisory system.

## Base URL

**Production**: `https://your-domain.example.com/api`  
**Local Development**: `http://localhost:3000/api`

## Best Practices

### Use the API Layer

**Always query data through the API, not directly from the database.**

```javascript
// ✅ Good: Use API endpoints
const overview = await API.getOverview();
const advisories = await API.getActiveAdvisories();
const sites = await API.getSites();

// ❌ Bad: Direct database queries in application code
// Never do this - keeps database logic in backend only
```

**Why**:
1. **Separation of Concerns**: Database logic centralized in backend
2. **Security**: No database credentials exposed to frontend
3. **Caching**: API can implement caching without changing clients
4. **Validation**: API validates and sanitizes inputs
5. **Evolution**: Can change database schema without breaking frontend
6. **Consistency**: Single source of truth for data access

### API Client Usage

Frontend uses `api.js` module for all API calls:

```javascript
// Located at: frontend/js/api.js
const API = {
    getOverview: async () => { /*...*/ },
    getActiveAdvisories: async () => { /*...*/ },
    // ... other methods
};

// Usage in pages
const data = await API.getOverview();
```

## Endpoints

### Overview & Status

#### GET `/api/status/overview`

Get dashboard overview statistics.

**Response**:
```json
{
    "total_sites": 219,
    "total_advisories": 45,
    "sites_closed": 2,
    "sites_at_risk": 8,
    "last_updated": "2026-02-13T14:00:00.000Z",
    "update_interval_minutes": 15
}
```

**Notes**:
- `last_updated`: ISO 8601 timestamp of last NOAA data ingestion
- `update_interval_minutes`: How frequently data is refreshed
- Frontend applies filter preferences to counts client-side

### Sites

#### GET `/api/sites`

Get all testing center locations.

**Response**:
```json
[
    {
        "site_id": 1,
        "site_code": "2703",
        "name": "Anchorage Test Center",
        "city": "Anchorage",
        "state": "AK",
        "latitude": 61.2181,
        "longitude": -149.9003,
        "region": "Alaska"
    },
    // ...
]
```

**Total Sites**: 219 locations across US and territories

#### GET `/api/status/sites-impacted`

Get sites currently impacted by weather advisories (Closed or At Risk status).

**Response**:
```json
[
    {
        "site_id": 1,
        "site_code": "2703",
        "name": "Anchorage Test Center",
        "city": "Anchorage",
        "state": "AK",
        "latitude": 61.2181,
        "longitude": -149.9003,
        "region": "Alaska",
        "operational_status": "Closed",
        "reason": "Blizzard Warning in effect",
        "advisory_count": 3
    },
    // ...
]
```

**Fields**:
- `operational_status`: "Closed" | "At Risk" | "Open"
- `reason`: Human-readable explanation
- `advisory_count`: Number of active advisories affecting site

### Advisories

#### GET `/api/advisories/active`

Get all currently active weather advisories.

**Response**:
```json
[
    {
        "id": 123,
        "site_id": 1,
        "site_code": "2703",
        "name": "Anchorage Test Center",
        "city": "Anchorage",
        "state": "AK",
        "source": "NOAA/NWS",
        "advisory_type": "Blizzard Warning",
        "headline": "Blizzard Warning until 6 PM AKST",
        "description": "Heavy snow and strong winds...",
        "severity": "Extreme",
        "urgency": "Immediate",
        "certainty": "Likely",
        "effective": "2026-02-13T10:00:00.000Z",
        "expires": "2026-02-14T02:00:00.000Z",
        "last_updated": "2026-02-13T14:00:00.000Z",
        "external_id": "urn:oid:2.49.0.1.840.0.abc123",
        "vtec_code": "/O.NEW.PAJK.BZ.W.0006.260213T1000Z-260214T0200Z/",
        "vtec_event_id": "PAJK.BZ.W.0006",
        "vtec_action": "NEW"
    },
    // ...
]
```

**VTEC Fields** (NOAA-specific):
- `vtec_code`: Full VTEC string (if available)
- `vtec_event_id`: Persistent event identifier (used for deduplication)
- `vtec_action`: Action code - NEW, CON, EXT, EXP, CAN, UPG, COR

**Action Codes**:
- **NEW**: New alert issued
- **CON**: Alert continuing
- **EXT**: Alert time extended  
- **EXA/EXB**: Alert extended (variants)
- **UPG**: Alert upgraded in severity
- **EXP**: Alert expired
- **CAN**: Alert cancelled
- **COR**: Correction issued
- **ROU**: Routine update

### Government Notices

#### GET `/api/notices/active`

Get active government and local emergency notices.

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
        "effective_time": "2026-02-13T00:00:00.000Z",
        "expires_time": "2026-02-20T00:00:00.000Z",
        "affected_states": "AK",
        "source_url": "https://gov.alaska.gov/...",
        "last_updated": "2026-02-13T14:00:00.000Z"
    },
    // ...
]
```

**Jurisdiction Types**: Federal, State, County, City

### Filter Configuration

#### GET `/api/filters`

Get available filter presets.

**Response**:
```json
{
    "CUSTOM": {
        "name": "Site Default",
        "description": "Balanced view for site operations",
        "includeCategories": ["CRITICAL", "HIGH", "MODERATE"],
        "excludeTypes": ["Gale Warning", "Red Flag Warning", ...]
    },
    "OPERATIONS": {
        "name": "Operations View",
        "description": "Focus on operational impact",
        "includeCategories": ["CRITICAL", "HIGH"]
    },
    // ... other presets
}
```

**Available Presets**:
- **CUSTOM**: Site Default (51/68 types)
- **OPERATIONS**: Operations View (26/68 types)
- **EXECUTIVE**: Executive Summary (18/68 types)
- **SAFETY**: Safety Focus (18/68 types)
- **FULL**: Full View (all types)

#### GET `/api/filters/types/all`

Get all NOAA alert types categorized by impact level.

**Response**:
```json
{
    "CRITICAL": [
        "Tornado Warning",
        "Hurricane Warning",
        "Flash Flood Warning",
        "Severe Thunderstorm Warning",
        // ...
    ],
    "HIGH": [
        "Winter Storm Warning",
        "Flood Warning",
        // ...
    ],
    "MODERATE": [...],
    "LOW": [...],
    "INFO": [...]
}
```

**Impact Levels**:
- **CRITICAL**: Immediate life-threatening conditions (12 types)
- **HIGH**: Significant impact, requires action (14 types)
- **MODERATE**: Moderate impact, monitor conditions (14 types)
- **LOW**: Minor impact, awareness needed (15 types)
- **INFO**: Informational only (13 types)

**Total**: 68 NOAA alert types

## Frontend Integration

### API Client Module

Located at `frontend/js/api.js`:

```javascript
const API_BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000/api'
    : 'https://your-domain.example.com/api';

const API = {
    // Core data endpoints
    async getOverview() {
        const response = await fetch(`${API_BASE_URL}/status/overview`);
        return await response.json();
    },
    
    async getActiveAdvisories() {
        const response = await fetch(`${API_BASE_URL}/advisories/active`);
        return await response.json();
    },
    
    async getSites() {
        const response = await fetch(`${API_BASE_URL}/sites`);
        return await response.json();
    },
    
    async getImpactedSites() {
        const response = await fetch(`${API_BASE_URL}/status/sites-impacted`);
        return await response.json();
    },
    
    async getActiveNotices() {
        const response = await fetch(`${API_BASE_URL}/notices/active`);
        return await response.json();
    },
    
    // Filter endpoints
    async getFilters() {
        const response = await fetch(`${API_BASE_URL}/filters`);
        return await response.json();
    },
    
    async getAllAlertTypes() {
        const response = await fetch(`${API_BASE_URL}/filters/types/all`);
        return await response.json();
    }
};
```

### Usage Examples

```javascript
// Load overview data
async function loadDashboard() {
    try {
        const overview = await API.getOverview();
        document.getElementById('total-sites').textContent = overview.total_sites;
        document.getElementById('total-advisories').textContent = overview.total_advisories;
    } catch (error) {
        console.error('Failed to load overview:', error);
    }
}

// Load advisories with error handling
async function loadAdvisories() {
    try {
        const advisories = await API.getActiveAdvisories();
        renderAdvisories(advisories);
    } catch (error) {
        showError('Failed to load advisories');
    }
}

// Load and apply filters
async function initFilters() {
    const filterConfig = await API.getFilters();
    const alertTypes = await API.getAllAlertTypes();
    // Apply filter preferences...
}
```

## Error Handling

All endpoints return standard HTTP status codes:

- **200 OK**: Successful request
- **400 Bad Request**: Invalid parameters
- **404 Not Found**: Resource not found
- **500 Internal Server Error**: Server error

Error response format:
```json
{
    "error": "Error message description"
}
```

## Data Freshness

- **Update Frequency**: Every 15 minutes
- **Source**: NOAA Weather API
- **Last Updated**: Available in `/api/status/overview` response
- **Countdown**: Frontend displays time until next update

## Rate Limiting

No rate limiting currently implemented. Frontend uses reasonable polling:
- Overview data: Fetched on page load only
- No auto-refresh (user must reload page)
- Respects NOAA API rate limits in backend ingestion

## CORS Configuration

Production API allows requests from:
- `https://your-domain.example.com`
- `http://localhost` (development)

## Database Access

**Important**: Never access the database directly from frontend or external applications.

```javascript
// ❌ NEVER DO THIS
// import mysql from 'mysql2';
// const db = mysql.createConnection({...});

// ✅ ALWAYS DO THIS
const data = await API.getActiveAdvisories();
```

**Rationale**:
1. Database credentials should never leave the backend
2. API provides validated, formatted data
3. Schema changes don't break clients
4. API can add caching, rate limiting, etc.
5. Centralized logging and monitoring

## Future Enhancements

Potential API improvements:

1. **Pagination**: For large advisory lists
2. **Filtering**: Query parameters for filtering by state, severity
3. **Webhooks**: Real-time notifications for new alerts
4. **GraphQL**: More flexible querying
5. **Rate Limiting**: Protect against abuse
6. **Caching**: Redis for frequently-accessed data
7. **WebSockets**: Real-time updates without polling

## Related Documentation

- [Deployment Guide](./deployment.md)
- [Database Schema](./database-schema.md)
- [VTEC Implementation](./vtec-implementation.md)
- [Frontend Architecture](./frontend-architecture.md)

---

**Last Updated**: February 13, 2026  
**API Version**: 1.0
