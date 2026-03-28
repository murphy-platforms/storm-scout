# Security Documentation

This folder contains security-related documentation for the Storm Scout project.

## Classification

This documentation covers security controls, vulnerability tracking, and dependency overrides for the Storm Scout project.

## Contents

### Security Guides

| File | Date | Type | Status |
|------|------|------|--------|
| `SRI.md` | Feb 15, 2026 | Subresource Integrity Guide | Active |
| `TRUST-PROXY.md` | Feb 15, 2026 | Trust Proxy Configuration | Active |
| `SECURE-TEMPLATES.md` | Feb 15, 2026 | XSS Prevention Guide | Active |

### Active Vulnerability Tracking

| Issue | CVE | Severity | Package | Status |
|-------|-----|----------|---------|--------|
| [#1] (legacy) | N/A | Critical | Backend Auth | ✅ Closed |
| [#2] (legacy) | N/A | High | Frontend XSS | ✅ Closed |
| [#3] (legacy) | N/A | Medium | Security Headers | ✅ Closed |
| [#4] (legacy) | N/A | Medium | CDN SRI | ✅ Closed |
| [#5] (legacy) | N/A | Medium | Trust Proxy | ✅ Closed |
| [#6] (legacy) | CVE-2026-2391 | Low | qs (transitive) | ✅ Closed — `qs` pinned to 6.14.2 via `overrides` |
| [#119](../../issues/119) | CVE-2026-27903 | Low | minimatch via qs | ✅ Closed — same `qs` 6.14.2 pin covers this ReDoS vector |

---

### Dependency Overrides

`backend/package.json` contains an `overrides` block that pins transitive dependencies to safe versions. Each override must be documented here so future maintainers can determine whether it is still required.

| Package | Pinned Version | CVEs Addressed | Review Trigger |
|---------|---------------|----------------|----------------|
| `qs` | `6.14.2` | CVE-2026-2391 (prototype pollution), CVE-2026-27903 (ReDoS via minimatch) | Remove override when upstream `axios` or its dependency chain ships `qs ≥ 6.14.2` natively |
| `flatted` | `3.4.2` | GHSA-rf6f-7fwh-wjgh (prototype pollution via `parse()` in `<=3.4.1`) | Remove override when upstream `eslint`/`file-entry-cache`/`flat-cache` chain resolves to `flatted > 3.4.1` without pinning |

**Maintenance procedure:**
1. On each `npm audit` finding referencing `qs` or `flatted`, verify whether the installed transitive version remains at or above the pinned safe version.
2. Run `npm ls qs` and `npm ls flatted` after any major dependency upgrade to confirm pins are still effective.
3. Remove stale `overrides` entries (and matching `overrideReasons` companions) once upstream resolves the dependency chain without pinning.

---

### Secret Rotation Policy

The following secrets require periodic rotation. "Zero-downtime" rotation means the new value is deployed before the old one is revoked, so no requests are rejected during the changeover.

#### `API_KEY` (write endpoint authentication)

| Attribute | Value |
|-----------|-------|
| Location | `backend/.env.production` → `API_KEY` |
| Used by | `requireApiKey` middleware on all write/admin endpoints; `deploy.sh` via `DEPLOY_API_KEY` |
| Recommended rotation interval | Every 90 days, or immediately upon suspected compromise |

**Zero-downtime rotation steps:**
1. Generate a new key: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Update `API_KEY` in `backend/.env.production` on the server.
3. Update `DEPLOY_API_KEY` in your local shell profile or `.deploy.config`.
4. Restart the Node.js application (Passenger restart or `pm2 restart storm-scout`).
5. Verify the new key works: `curl -X GET -H "X-Api-Key: <new-key>" https://<host>/api/admin/status`
6. Invalidate and discard the old key — do not store it anywhere.

#### `DB_PASSWORD` (database connection)

| Attribute | Value |
|-----------|-------|
| Location | `backend/.env.production` → `DB_PASSWORD`; database user grant |
| Used by | MySQL/MariaDB connection pool |
| Recommended rotation interval | Every 180 days, or immediately upon suspected compromise |

**Zero-downtime rotation steps:**
1. Create the new password in the database **before** updating the app:
   ```sql
   ALTER USER 'your_db_user'@'localhost' IDENTIFIED BY '<new-password>';
   FLUSH PRIVILEGES;
   ```
2. Update `DB_PASSWORD` in `backend/.env.production`.
3. Restart the application — the pool will reconnect with the new password.
4. Verify: `GET /health` → `checks.database.status` should return `ok`.

> **Note:** On shared hosting, the DB password may also need to be updated in your hosting provider's database management interface. Change both simultaneously and restart immediately.

#### Optional API Keys (`STATE_EMERGENCY_API_KEY`, `FEMA_API_KEY`)

These keys are commented out in `.env.production.example` and are not currently active. If enabled in a future integration, apply the same 90-day rotation interval and zero-downtime steps as `API_KEY` above. Document each in the Rotation Log below when first activated.

---

### v2.1.x Security Controls

- **SSRF Domain Validation**: `getObservationStations()` in `api-client.js` validates that the stations URL starts with `https://api.weather.gov/` before following redirects from NOAA API responses
- **Input Sanitization**: `sanitizeStationName()` in `map-observation-stations.js` validates type, strips control characters and Unicode bidi overrides, and truncates to column width before database insertion
- **Prototype Pollution Guard**: `Object.hasOwn()` used for preset lookup in `applyLocationPreset()` to prevent inherited Object.prototype method names from being treated as valid presets
- **JSON Schema Validation**: `loadPreferences()` in both `location-filters.js` and `page-filters.js` validates localStorage JSON is a non-null, non-array object before use
- **XSS Defense**: `escapeHtml()` applied to VTEC action code fallback path in `getActionBadge()` and `getActionBadgeWithTime()` in `utils.js`
- **Health Endpoint Rate Limiting**: Dedicated `healthLimiter` (120 req/min per IP) on `/health` endpoint prevents database connection pool exhaustion via flood attacks

### `/policies` (Future)
Security policies and procedures specific to Storm Scout.

## Access Control

This documentation is publicly available as part of the open-source Storm Scout project.

## Related Resources

- **GitHub Issues**: Security findings are tracked as GitHub Issues with the `security` label
- **SECURITY.md**: See `/SECURITY.md` for vulnerability reporting procedures

## Document Retention

Security assessments should be retained for a minimum of 3 years or as required by organizational policy. Assessments may be archived (not deleted) after all findings have been remediated and verified.

## Questions

For questions about security documentation, contact the Storm Scout project maintainers or your organization's security team.
