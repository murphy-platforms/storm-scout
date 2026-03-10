/**
 * API Key Authentication Middleware
 *
 * Protects write endpoints with a shared secret API key supplied via the
 * X-Api-Key request header.  Applied only to /api/operational-status (the
 * route group that contains all write operations).  Read-only endpoints
 * remain open — see auth strategy notes below.
 *
 * ── Authentication strategy ──────────────────────────────────────────────────
 *
 * CURRENT (Option D — write-only API key):
 *   All POST/write endpoints under /api/operational-status require a valid
 *   X-Api-Key header.  Read endpoints (/api/offices, /api/advisories, etc.)
 *   remain unauthenticated because they serve only public NOAA weather data
 *   and the write endpoints are currently stubbed as 501 Not Implemented.
 *   This middleware is in place so that when those stubs go live the writes
 *   are protected from day one.
 *
 * PRODUCTION (Option C — reverse-proxy / SSO, to be implemented at deploy):
 *   When this application is deployed to the USPS production environment it
 *   should be placed behind the enterprise reverse proxy and integrated with
 *   the business Identity Management (IDM) system for SAML 2.0 or SSO
 *   authentication.  That integration will gate access at the network/proxy
 *   layer before requests reach this Node.js process, providing full
 *   authentication for both read and write endpoints without requiring
 *   per-request token handling inside the application.
 *
 *   At that point this API key middleware can be retired or kept as a
 *   defence-in-depth layer for service-to-service calls that bypass the
 *   proxy (e.g. internal cron jobs, health monitors).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Configuration:
 *   Set API_KEY in .env (or .env.production) to a long random secret.
 *   Generate one with:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * Usage (client):
 *   Add the header to every write request:
 *     X-Api-Key: <value of API_KEY>
 */

const crypto = require('crypto');

/**
 * Require a valid API key on the request.
 * Returns 401 if the header is missing or does not match API_KEY.
 * Returns 503 if the server has not been configured with an API_KEY (fail-closed).
 *
 * Uses crypto.timingSafeEqual() to prevent timing side-channel attacks that
 * could allow an attacker to infer key validity character-by-character via
 * network timing measurements. (closes #95)
 */
function requireApiKey(req, res, next) {
  const configuredKey = process.env.API_KEY;

  // Fail-closed: if no key is configured the endpoint is inaccessible.
  // This prevents write operations being accidentally exposed on a server
  // where the env var was forgotten.
  if (!configuredKey) {
    console.error('[AUTH] API_KEY is not set — write endpoint is inaccessible until configured');
    return res.status(503).json({
      success: false,
      error: 'Service unavailable: authentication is not configured'
    });
  }

  const providedKey = req.headers['x-api-key'];

  if (!providedKey) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: valid X-Api-Key header required'
    });
  }

  // Length must match before calling timingSafeEqual (throws on length mismatch).
  // The length check itself leaks no useful information — it is an integer
  // compare, not a character-by-character string walk.
  const a = Buffer.from(providedKey);
  const b = Buffer.from(configuredKey);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: valid X-Api-Key header required'
    });
  }

  next();
}

module.exports = { requireApiKey };
