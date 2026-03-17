/**
 * Express Application Configuration
 * Sets up middleware, routes, and error handling
 *
 * @generated AI-authored (Claude, Warp) — vanilla JS by design
 */

const express = require('express');
const compression = require('compression');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const config = require('./config/config');
const { getDatabase } = require('./config/database');
const IngestionEvent = require('./models/ingestionEvent');
const { apiLimiter, writeLimiter, authLimiter } = require('./middleware/rateLimiter');
const { requireApiKey } = require('./middleware/apiKey');
const { metricsMiddleware, mountMetricsEndpoint } = require('./middleware/metrics');

// Import routes
const sitesRouter = require('./routes/offices');
const advisoriesRouter = require('./routes/advisories');
const statusRouter = require('./routes/status');
const noticesRouter = require('./routes/notices');
const filtersRouter = require('./routes/filters');
const operationalStatusRouter = require('./routes/operational-status');
const trendsRouter = require('./routes/trends');
const historyRouter = require('./routes/history');
const observationsRouter = require('./routes/observations');
const adminRouter = require('./routes/admin');

// Read version info from package.json at startup (not on each request)
const pkg = require('../package.json');

// Create Express app
const app = express();

// Trust proxy — only enable when a reverse proxy (Nginx, Apache, etc.)
// sits in front of this app and strips/rewrites X-Forwarded-For.
// Without a proxy, enabling this allows clients to spoof their IP address
// and bypass rate limiting. Set TRUST_PROXY=true in .env when deploying
// behind a reverse proxy.
if (process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
    console.info(
        '[INFO] trust proxy enabled — ensure a reverse proxy is stripping X-Forwarded-For before forwarding requests.'
    );
}

// Subpath deployment: strip BASE_PATH prefix so all routes work unchanged.
// LiteSpeed Passenger may forward the full URL (e.g. /stormscout/api/offices)
// without stripping the base URI. This middleware normalises req.url before
// any route matching occurs. No-op when BASE_PATH is unset.
const basePath = (process.env.BASE_PATH || '').replace(/\/+$/, '');
if (basePath && basePath !== '/') {
    app.use((req, res, next) => {
        if (req.url === basePath) {
            req.url = '/';
            return next();
        }
        if (req.url.startsWith(`${basePath}/`)) {
            req.url = req.url.slice(basePath.length) || '/';
        }
        next();
    });
    console.info(`[INFO] BASE_PATH=${basePath} — stripping prefix from incoming requests.`);
}

// Middleware
// Security headers via helmet
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: [
                    "'self'",
                    // 'unsafe-inline' removed — all page scripts externalized to js/page-*.js files
                    'cdn.jsdelivr.net',
                    'unpkg.com', // Leaflet maps
                    'www.googletagmanager.com'
                ],
                styleSrc: [
                    "'self'",
                    "'unsafe-inline'", // Required by Leaflet tile/container inline positioning
                    'cdn.jsdelivr.net',
                    'unpkg.com' // Leaflet CSS
                ],
                fontSrc: [
                    "'self'",
                    'cdn.jsdelivr.net' // Bootstrap Icons
                ],
                imgSrc: [
                    "'self'",
                    'data:', // For inline images and icons
                    'www.googletagmanager.com',
                    'tile.openstreetmap.org', // Bare domain used by modern OSM tile endpoint
                    '*.tile.openstreetmap.org' // Wildcard kept for any subdomain usage
                ],
                connectSrc: [
                    "'self'",
                    'www.google-analytics.com',
                    'region1.google-analytics.com',
                    '*.google-analytics.com'
                ],
                objectSrc: ["'none'"],
                upgradeInsecureRequests: config.env === 'production' ? [] : null
            }
        },
        // Referrer-Policy: send referrer for same-protocol requests (needed for OSM tile servers).
        // Matches deployment/nginx.conf.example so behavior is consistent with or without the proxy.
        referrerPolicy: { policy: 'no-referrer-when-downgrade' },
        // HSTS: enforce HTTPS in production
        strictTransportSecurity:
            config.env === 'production'
                ? {
                      maxAge: 31536000, // 1 year
                      includeSubDomains: true
                  }
                : false
    })
);

if (config.cors.origin === false) {
    const msg = 'CORS_ORIGIN is not set — all cross-origin requests will be blocked.';
    if (config.env === 'production') {
        console.warn(`[WARN] ${msg} Set CORS_ORIGIN in .env.production to allow the frontend origin.`);
    } else {
        console.info(`[INFO] ${msg}`);
    }
}
app.use(cors({ origin: config.cors.origin }));
app.use(compression()); // Gzip API responses and static files (~85% size reduction)
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Prometheus metrics — request counting and duration histogram
app.use(metricsMiddleware);

// Rate limiting - apply to all /api routes
app.use('/api', apiLimiter);

// Stricter rate limiting for write operations
app.use('/api/operational-status', writeLimiter);

// API key authentication for write endpoints.
// Read endpoints remain open (public NOAA data only).
//
// FUTURE: supplement this with SSO at the reverse-proxy layer for full
// authentication.  See backend/src/middleware/apiKey.js for strategy notes.
app.use('/api/operational-status', authLimiter, requireApiKey);

// Serve static files (if path configured)
/* istanbul ignore next -- static file serving only active when STATIC_FILES_PATH is configured */
if (config.staticFiles.path) {
    const publicPath = path.resolve(config.staticFiles.path);
    console.log(`Serving static files from: ${publicPath}`);

    // Cache-Control: long cache for versioned assets (CSS/JS), no-cache for HTML
    app.use(
        express.static(publicPath, {
            maxAge: '7d', // Default: cache assets for 7 days
            setHeaders: (res, filePath) => {
                if (filePath.endsWith('.html')) {
                    // HTML must always revalidate so users get fresh pages
                    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
                }
            }
        })
    );
}

// Request logging middleware
// In development: always log. In production: log only when LOG_FORMAT=json (structured).
// Structured JSON format is parsed by log aggregators (Splunk, CloudWatch, etc.).
const jsonLogging = process.env.LOG_FORMAT === 'json';
if (config.env === 'development' || jsonLogging) {
    app.use((req, res, next) => {
        const start = Date.now();
        res.on('finish', () => {
            const ms = Date.now() - start;
            if (jsonLogging) {
                console.log(
                    JSON.stringify({
                        ts: new Date().toISOString(),
                        method: req.method,
                        path: req.path,
                        status: res.statusCode,
                        ms,
                        ip: req.ip,
                        ua: req.headers['user-agent']?.substring(0, 120) || ''
                    })
                );
            } else {
                console.log(`${new Date().toISOString()} ${req.method} ${req.path} ${res.statusCode} ${ms}ms`);
            }
        });
        next();
    });
}

// Liveness probe — always returns 200 with no I/O, for supervisor keep-alive checks. (closes #104)
app.get('/ping', (req, res) => res.json({ status: 'ok' }));

// Prometheus metrics endpoint — unauthenticated, for Prometheus scraping
mountMetricsEndpoint(app);

// Public health check — returns only status for load balancers and supervisors.
// Detailed diagnostics (memory, circuit breaker, ingestion) are at /api/admin/health behind API key auth.
app.get('/health', async (req, res) => {
    let status = 'ok';
    try {
        const db = getDatabase();
        await db.query('SELECT 1');
    } catch {
        status = 'degraded';
    }

    const httpStatus = status === 'ok' ? 200 : 503;
    res.status(httpStatus).json({ status, timestamp: new Date().toISOString() });
});

// X-Data-Age header — tells the frontend how old the data is (seconds since last ingestion)
// Reads from the ingestion_events DB table instead of .last-ingestion.json. (closes #264)
app.use('/api', async (req, res, next) => {
    try {
        const last = await IngestionEvent.getLastSuccessful();
        if (last) {
            const ageSec = last.minutesAgo * 60;
            res.setHeader('X-Data-Age', String(ageSec));
        }
    } catch (_) {
        /* non-critical — table may not exist yet */
    }
    next();
});

// API routes
app.use('/api/offices', sitesRouter);
app.use('/api/advisories', advisoriesRouter);
app.use('/api/status', statusRouter);
app.use('/api/notices', noticesRouter);
app.use('/api/filters', filtersRouter);
app.use('/api/operational-status', operationalStatusRouter);
app.use('/api/trends', trendsRouter);
app.use('/api/history', historyRouter);
app.use('/api/observations', observationsRouter);
app.use('/api/admin', adminRouter);

// Version endpoint
app.get('/api/version', (req, res) => {
    res.json({
        version: pkg.version,
        released: pkg.releasedDate || null
    });
});

// API info endpoint
app.get('/api', (req, res) => {
    res.json({
        name: 'Storm Scout API',
        version: pkg.version,
        endpoints: {
            version: '/api/version',
            health: '/health (Database + Ingestion status)',
            offices: '/api/offices',
            advisories: '/api/advisories',
            status: '/api/status',
            notices: '/api/notices',
            filters: '/api/filters',
            operational_status: '/api/operational-status',
            trends: '/api/trends',
            history: '/api/history',
            observations: '/api/observations'
        }
    });
});

// 404 handler for API routes
/* istanbul ignore next -- Express 5 wildcard syntax; not matched in Express 4.x */
app.use('/api/*path', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'API endpoint not found',
        path: req.path
    });
});

// Error handler
app.use((err, req, res, next) => {
    // Pool exhaustion: return 503 with Retry-After so clients back off gracefully
    if (err.isPoolExhausted) {
        res.setHeader('Retry-After', '5');
        return res.status(503).json({
            success: false,
            error: 'Service temporarily unavailable — please retry shortly.'
        });
    }
    console.error('Error:', err);
    res.status(500).json({
        success: false,
        error: config.env === 'development' ? err.message : 'Internal server error'
    });
});

// Serve index.html for all other non-API routes (SPA fallback)
// This must be last to avoid catching API routes
/* istanbul ignore next -- SPA fallback only active when STATIC_FILES_PATH is configured */
if (config.staticFiles.path) {
    app.get('*path', (req, res) => {
        const indexPath = path.resolve(config.staticFiles.path, 'index.html');
        res.sendFile(indexPath);
    });
}

module.exports = app;
