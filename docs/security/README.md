# Security Documentation

This folder contains security-related documentation for the Storm Scout project.

## Classification

**Internal Use Only** - This documentation is intended for authorized team members only.

## Contents

### `/assessments`
Point-in-time security assessments and vulnerability reports.

| File | Date | Type | Status |
|------|------|------|--------|
| `2026-02-15-security-assessment.html` | Feb 15, 2026 | Application Security Review | Active |
| `SRI.md` | Feb 15, 2026 | Subresource Integrity Guide | Active |
| `TRUST-PROXY.md` | Feb 15, 2026 | Trust Proxy Configuration | Active |

### Active Vulnerability Tracking

| Issue | CVE | Severity | Package | Status |
|-------|-----|----------|---------|--------|
| [#1](https://github.com/Prometric-Site-Engineering/storm-scout/issues/1) | N/A | Critical | Backend Auth | ✅ Closed |
| [#2](https://github.com/Prometric-Site-Engineering/storm-scout/issues/2) | N/A | High | Frontend XSS | ✅ Closed |
| [#3](https://github.com/Prometric-Site-Engineering/storm-scout/issues/3) | N/A | Medium | Security Headers | ✅ Closed |
| [#4](https://github.com/Prometric-Site-Engineering/storm-scout/issues/4) | N/A | Medium | CDN SRI | ✅ Closed |
| [#5](https://github.com/Prometric-Site-Engineering/storm-scout/issues/5) | N/A | Medium | Trust Proxy | ✅ Closed |
| [#6](https://github.com/Prometric-Site-Engineering/storm-scout/issues/6) | CVE-2026-2391 | Low | qs (transitive) | ✅ Closed — `qs` pinned to 6.14.2 via `overrides` |
| [#119](https://github.com/murphy-platforms/storm-scout-usps/issues/119) | CVE-2026-27903 | Low | minimatch via qs | ✅ Closed — same `qs` 6.14.2 pin covers this ReDoS vector |

---

### Dependency Overrides

`backend/package.json` contains an `overrides` block that pins transitive dependencies to safe versions. Each override must be documented here so future maintainers can determine whether it is still required.

| Package | Pinned Version | CVEs Addressed | Review Trigger |
|---------|---------------|----------------|----------------|
| `qs` | `6.14.2` | CVE-2026-2391 (prototype pollution), CVE-2026-27903 (ReDoS via minimatch) | Remove override when upstream `axios` or its dependency chain ships `qs ≥ 6.14.2` natively |

**Maintenance procedure:**
1. On each `npm audit` finding referencing `qs`, verify whether the installed transitive version is still `6.14.2` or higher.
2. Run `npm ls qs` after any major dependency upgrade to confirm the pin is still effective.
3. Remove the `overrides.qs` entry (and its `overrideReasons.qs` companion) once the upstream package resolves the dependency without the pin.

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
   ALTER USER 'storm_scout'@'localhost' IDENTIFIED BY '<new-password>';
   FLUSH PRIVILEGES;
   ```
2. Update `DB_PASSWORD` in `backend/.env.production`.
3. Restart the application — the pool will reconnect with the new password.
4. Verify: `GET /health` → `checks.database.status` should return `ok`.

> **Note:** On cPanel shared hosting the DB password may also need to be updated in the cPanel MySQL Users interface. Change both simultaneously and restart immediately.

#### Optional API Keys (`STATE_EMERGENCY_API_KEY`, `FEMA_API_KEY`)

These keys are commented out in `.env.production.example` and are not currently active. If enabled in a future integration, apply the same 90-day rotation interval and zero-downtime steps as `API_KEY` above. Document each in the Rotation Log below when first activated.

---

#### Rotation Log

Maintain a record of rotations (date only — never log the actual key values):

| Secret | Last Rotated | Rotated By | Notes |
|--------|-------------|------------|-------|
| `API_KEY` | 2026-03-10 | Project initialization | Initial value set |
| `DB_PASSWORD` | 2026-03-10 | Project initialization | Initial value set |

### `/policies` (Future)
Security policies and procedures specific to Storm Scout.

## Access Control

Access to this documentation is controlled through GitHub repository permissions. Only users with access to the `storm-scout` repository can view these files.

## Related Resources

- **GitHub Issues**: Security findings are tracked as GitHub Issues with the `security` label
- **SECURITY.md**: See `/.github/SECURITY.md` for vulnerability reporting procedures

## Document Retention

Security assessments should be retained for a minimum of 3 years or as required by organizational policy. Assessments may be archived (not deleted) after all findings have been remediated and verified.

## Questions

For questions about security documentation, contact the Storm Scout project maintainers or your organization's security team.
