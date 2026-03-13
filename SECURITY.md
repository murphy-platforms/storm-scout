# Security Policy

## Reporting Vulnerabilities

If you discover a security vulnerability in Storm Scout, **please do not open a public GitHub issue.**

Report vulnerabilities by opening a [GitHub Security Advisory](../../security/advisories/new) (private disclosure). Include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested remediation (if available)

We will acknowledge reports within 48 hours and work toward a fix as quickly as possible.

## Supported Versions

| Version | Security Support |
|---------|-----------------|
| Latest release | ✅ Full support |
| Previous release | Critical fixes only |
| Older releases | No support |

## Security Controls

Storm Scout implements the following security controls:

| Control | Implementation |
|---------|---------------|
| XSS Prevention | `html` tagged template in `frontend/js/utils.js` |
| Security Headers | helmet.js (CSP, HSTS, X-Frame-Options, X-Content-Type-Options) |
| CDN Integrity | SRI hashes on all external CDN resources |
| Input Validation | express-validator on all API endpoints |
| Rate Limiting | express-rate-limit (30,000 req/60 min general; 20 req/15 min write) |
| API Authentication | Timing-safe API key comparison via `crypto.timingSafeEqual()` |
| SQL Injection | Parameterized queries only — no string interpolation |

## Deployment Security Notes

When deploying Storm Scout:

- Use HTTPS/TLS (reverse proxy required — see `DEPLOY.md`)
- Set `TRUST_PROXY=true` only when behind a confirmed reverse proxy
- Use strong, unique database credentials; never reuse credentials across deployments
- Keep `.env.production` out of version control (it is gitignored by default)
- Set `NOAA_API_USER_AGENT` to a shared organizational contact email, not a personal email — this value is sent to the NOAA API on every weather data request
- Request logs capture IP addresses and User-Agent strings for rate limiting and security monitoring; implement an appropriate data retention policy for your deployment context

## Disclaimer

Storm Scout is an independent developer project and is not affiliated with, endorsed by, or connected to the the demo data source organization. The name® is a registered trademark of the United States Postal Service.
