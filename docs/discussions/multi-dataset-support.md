# Feature Concept: Multi-Dataset Support — Beyond Post Offices

> **GitHub Discussion draft** — Paste into a new Discussion under the "Ideas" category after enabling Discussions in repo Settings.

---

## Motivation

Storm Scout was built to monitor weather advisories for post office locations, but nothing in the architecture is post-office-specific. The CSV import pipeline (`import-offices.js`) accepts any US location with a zip code and coordinates. This means Storm Scout can monitor weather impact on **any type of physical infrastructure** — airports, rail stations, national parks, entertainment venues, warehouses, retail stores, cell towers, or anything else with a street address.

We've validated this by generating four alternative datasets from OpenStreetMap:

| Dataset | Locations | Source |
|---------|-----------|--------|
| US Airports (IATA-coded) | 300 | `aeroway=aerodrome` |
| US Train Stations | 300 | `railway=station` |
| US Ranger Stations | 300 | `amenity=ranger_station` |
| US Drive-In Theaters | 266 | `amenity=cinema` + `drive_in=yes` |

Each dataset passes `import-offices.js` validation with zero skipped rows and can be loaded into Storm Scout today by running:

```bash
node src/scripts/import-offices.js src/data/csv/airports.csv
```

## What Exists Today

**Already working (single-dataset swap):**
- `generate-osm-locations.js` — Queries OpenStreetMap Overpass API, enriches with Nominatim geocoding, outputs CSV (`60f06d6`)
- Four CSV files in `backend/src/data/csv/` (`970f782`, `6b8c3f0`)
- The existing import pipeline validates and loads any conforming CSV
- NOAA alert matching works for any US coordinates (UGC codes, county, state fallback)

**Usage today:** Fork the repo, swap the CSV, and you have a weather dashboard for your locations. This is documented in the README under "Adapting for Your Organization."

## Ideas for Future Work

These are starting points for discussion, not a roadmap:

### 1. Location Type Awareness (Low Effort)
Add an optional `location_type` column to the CSV and `offices` table. This would allow a single deployment to hold mixed location types while keeping the current schema intact.

```csv
zip,name,city,state,latitude,longitude,region,county,location_type
30301,Hartsfield-Jackson,Atlanta,GA,33.6407,-84.4277,Southeast,Fulton County,airport
30303,Atlanta Station,Atlanta,GA,33.7530,-84.3880,Southeast,Fulton County,train_station
```

### 2. Terminology Generalization (Medium Effort)
The codebase uses "office" consistently (database table, API routes, frontend labels). Generalizing to "location" or "site" would make the project more intuitive for non-postal use cases. This touches:
- Database: `offices` table name and `office_code` column
- API: `/api/offices` routes
- Frontend: page titles, card labels, filter presets
- Scripts: import/export terminology

One approach: keep the database as-is but alias the API (`/api/locations` alongside `/api/offices`) and make frontend labels configurable.

### 3. Multi-Dataset Dashboard (Higher Effort)
Support multiple location types simultaneously in the UI:
- Filter sidebar by location type (checkboxes)
- Color-coded map markers per type
- Per-type severity summaries on the dashboard
- Separate or combined advisory feeds

### 4. Dataset Generator Expansion
The `generate-osm-locations.js` script currently supports 4 dataset types. OpenStreetMap has rich tagging for many more:
- Hospitals (`amenity=hospital`)
- Schools (`amenity=school`)
- Power plants (`power=plant`)
- Cell towers (`man_made=mast` + `tower:type=communication`)
- Gas stations (`amenity=fuel`)
- Warehouses / distribution centers (`building=warehouse`)

## Current Architecture Coupling Points

For reference, here is where "office" is hardcoded:

| Layer | Files | Coupling |
|-------|-------|----------|
| Database | `schema.sql` | `offices` table, `office_code` column, FK references |
| Backend model | `src/models/office.js` | All queries reference `offices` table |
| API routes | `src/routes/offices.js` | `/api/offices/*` endpoints |
| Ingestion | `src/ingestion/` | Alert matching joins on `offices` |
| Frontend | `index.html`, `js/*.js` | "Office" in labels, cards, filters |
| Import scripts | `import-offices.js`, `add-new-offices.js` | "Office" terminology |
| Documentation | `README.md`, `docs/*` | "Office" throughout |

## Open Questions

1. **Naming**: Should we generalize to "locations", "sites", "assets", or keep "offices" with a type field?
2. **Scope**: Single-type deployments (swap CSV) vs. multi-type dashboards (mixed locations)?
3. **Priority**: Is this worth pursuing before other planned work (multi-country support, Prometheus metrics, etc.)?
4. **Backwards compatibility**: How important is it to keep `/api/offices` working alongside any new `/api/locations` endpoint?

## References

- Generator script: [`generate-osm-locations.js`](../backend/src/scripts/generate-osm-locations.js) (commit `60f06d6`)
- CSV datasets: [`backend/src/data/csv/`](../backend/src/data/csv/) (commits `970f782`, `6b8c3f0`)
- Import pipeline: [`import-offices.js`](../backend/src/scripts/import-offices.js)
- Existing adaptability docs: [README — Adapting for Your Organization](../README.md)
