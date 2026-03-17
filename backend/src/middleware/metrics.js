/**
 * Prometheus Metrics Middleware
 * Exposes application metrics at GET /metrics for Prometheus scraping.
 */

const client = require('prom-client');

// Collect default Node.js metrics (GC, event loop, heap, etc.)
client.collectDefaultMetrics();

// ── HTTP request metrics ────────────────────────────────────────────────

const httpRequestsTotal = new client.Counter({
    name: 'http_requests_total',
    help: 'Total HTTP requests',
    labelNames: ['method', 'route', 'status']
});

const httpRequestDuration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
});

// ── Ingestion metrics ───────────────────────────────────────────────────

const ingestionCycleDuration = new client.Histogram({
    name: 'ingestion_cycle_duration_seconds',
    help: 'NOAA ingestion cycle duration in seconds',
    buckets: [10, 30, 60, 120, 300, 600]
});

const ingestionAdvisoriesTotal = new client.Counter({
    name: 'ingestion_advisories_total',
    help: 'Total advisories ingested'
});

// ── Cache metrics ───────────────────────────────────────────────────────

const cacheHitsTotal = new client.Counter({
    name: 'cache_hits_total',
    help: 'Total cache hits'
});

const cacheMissesTotal = new client.Counter({
    name: 'cache_misses_total',
    help: 'Total cache misses'
});

// ── Circuit breaker metric ──────────────────────────────────────────────

const circuitBreakerState = new client.Gauge({
    name: 'circuit_breaker_state',
    help: 'NOAA circuit breaker state (0=CLOSED, 1=HALF_OPEN, 2=OPEN)'
});

// ── DB pool metric ──────────────────────────────────────────────────────

const dbPoolActiveConnections = new client.Gauge({
    name: 'db_pool_active_connections',
    help: 'Active database pool connections'
});

/**
 * Express middleware that records request count and duration.
 * Normalises route paths to avoid high-cardinality label explosions
 * (e.g. /api/trends/123 → /api/trends/:id).
 */
function metricsMiddleware(req, res, next) {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
        const durationSec = Number(process.hrtime.bigint() - start) / 1e9;
        const route = normaliseRoute(req.route ? req.route.path : req.path);
        const labels = { method: req.method, route, status: res.statusCode };
        httpRequestsTotal.inc(labels);
        httpRequestDuration.observe(labels, durationSec);
    });
    next();
}

/**
 * Collapse numeric path segments to :id to keep cardinality manageable.
 */
function normaliseRoute(path) {
    return path.replace(/\/\d+/g, '/:id');
}

const CIRCUIT_STATE_MAP = { CLOSED: 0, HALF_OPEN: 1, OPEN: 2 };

/**
 * Mount the /metrics endpoint on an Express app.
 * Should be called once during app setup.
 * Updates point-in-time gauges (circuit breaker, DB pool) on each scrape.
 */
function mountMetricsEndpoint(app, ...middleware) {
    app.get('/metrics', ...middleware, async (req, res) => {
        // Update circuit breaker gauge from current state
        try {
            const { getCircuitBreakerState } = require('../ingestion/utils/api-client');
            const cb = getCircuitBreakerState();
            circuitBreakerState.set(CIRCUIT_STATE_MAP[cb.state] ?? 0);
        } catch (_) {
            /* api-client not loaded yet */
        }

        // Update DB pool gauge
        try {
            const { getDatabase } = require('../config/database');
            const pool = getDatabase();
            if (pool.pool) {
                dbPoolActiveConnections.set(pool.pool._allConnections.length - pool.pool._freeConnections.length);
            }
        } catch (_) {
            /* DB not initialised yet */
        }

        res.set('Content-Type', client.register.contentType);
        res.end(await client.register.metrics());
    });
}

module.exports = {
    metricsMiddleware,
    mountMetricsEndpoint,
    // Expose counters/gauges so other modules can instrument themselves
    ingestionCycleDuration,
    ingestionAdvisoriesTotal,
    cacheHitsTotal,
    cacheMissesTotal,
    circuitBreakerState,
    dbPoolActiveConnections
};
