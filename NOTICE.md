# Third-Party Notices

Storm Scout is licensed under the [MIT License](LICENSE). This file documents
the third-party data sources and libraries used by the project together with
their respective licenses.

---

## Data Sources

### OpenStreetMap

The example location datasets in `backend/src/data/csv/` (airports, train
stations, ranger stations, drive-in theaters) were generated from
[OpenStreetMap](https://www.openstreetmap.org/) data using the Overpass API
and Nominatim reverse-geocoding service.

- **License:** [Open Data Commons Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/)
- **Attribution:** &copy; OpenStreetMap contributors
- **Details:** <https://www.openstreetmap.org/copyright>

Map tiles displayed on the Map View page are served from OpenStreetMap tile
servers and are also subject to the ODbL.

### NOAA / National Weather Service

All weather alert, warning, and advisory data is sourced from the
[NOAA Weather API](https://www.weather.gov/documentation/services-web-api).

- **License:** Public domain &mdash; US government work, no usage restrictions
- **Attribution:** National Oceanic and Atmospheric Administration / National Weather Service
- **Details:** <https://www.weather.gov>

---

## Frontend Libraries (CDN)

| Library | Version | License | Copyright |
|---------|---------|---------|-----------|
| [Bootstrap](https://getbootstrap.com/) | 5.3.8 | MIT | Copyright (c) 2011-2024 The Bootstrap Authors |
| [Bootstrap Icons](https://icons.getbootstrap.com/) | 1.13.1 | MIT | Copyright (c) 2019-2024 The Bootstrap Authors |
| [Leaflet](https://leafletjs.com/) | 1.9.4 | BSD-2-Clause | Copyright (c) 2010-2023 Volodymyr Agafonkin, Mapbox |
| [Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster) | 1.5.3 | MIT | Copyright (c) 2012 Dave Leaver |

---

## Backend Dependencies (npm)

All backend dependencies are installed via npm and listed in
`backend/package.json`. They are licensed under MIT, ISC, or BSD-style
licenses. Run `npx license-checker` in the `backend/` directory for a full
dependency license report.

Key dependencies:

| Package | License |
|---------|---------|
| [Express](https://expressjs.com/) | MIT |
| [axios](https://axios-http.com/) | MIT |
| [mysql2](https://github.com/sidorares/node-mysql2) | MIT |
| [helmet](https://helmetjs.github.io/) | MIT |
| [node-cron](https://github.com/node-cron/node-cron) | ISC |
| [dotenv](https://github.com/motdotla/dotenv) | BSD-2-Clause |
