/**
 * Admin API Routes
 * Protected endpoints for operational control (pause/resume ingestion).
 * All routes require a valid API key via requireApiKey middleware.
 */

const express = require('express');
const router = express.Router();
const { requireApiKey } = require('../middleware/apiKey');
const { startScheduler, stopScheduler, getSchedulerStatus, waitForIngestionIdle } = require('../ingestion/scheduler');

// All admin routes require API key authentication
router.use(requireApiKey);

/**
 * POST /api/admin/pause-ingestion
 * Stops the ingestion scheduler and waits for any active cycle to finish.
 * Used by deploy.sh before deploying new code/migrations. (closes #112)
 */
router.post('/pause-ingestion', async (req, res) => {
    try {
        const status = getSchedulerStatus();

        if (!status.ingestion.running) {
            return res.json({
                success: true,
                message: 'Ingestion scheduler was not running — nothing to pause',
                status: getSchedulerStatus()
            });
        }

        // Stop the scheduler from queuing new runs
        stopScheduler();
        console.log('[Admin] Ingestion scheduler paused via API');

        // If a cycle is actively in progress, wait for it to finish (up to 5 min)
        if (status.ingestion.inProgress) {
            console.log('[Admin] Waiting for active ingestion cycle to complete...');
            await waitForIngestionIdle(5 * 60 * 1000);
            console.log('[Admin] Active ingestion cycle finished');
        }

        res.json({
            success: true,
            message: 'Ingestion paused. Active cycle (if any) has completed.',
            status: getSchedulerStatus()
        });
    } catch (error) {
        console.error('[Admin] Failed to pause ingestion:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/admin/resume-ingestion
 * Restarts the ingestion scheduler after a deploy pause.
 */
router.post('/resume-ingestion', (req, res) => {
    try {
        const status = getSchedulerStatus();

        if (status.ingestion.running) {
            return res.json({
                success: true,
                message: 'Ingestion scheduler is already running — nothing to resume',
                status
            });
        }

        startScheduler();
        console.log('[Admin] Ingestion scheduler resumed via API');

        res.json({
            success: true,
            message: 'Ingestion scheduler resumed',
            status: getSchedulerStatus()
        });
    } catch (error) {
        console.error('[Admin] Failed to resume ingestion:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/admin/status
 * Returns current scheduler and ingestion status.
 */
router.get('/status', (req, res) => {
    res.json({ success: true, status: getSchedulerStatus() });
});

/**
 * GET /api/admin/health
 * Detailed health diagnostics — database, ingestion freshness, data integrity,
 * memory usage, circuit breaker state. Requires API key authentication.
 * The public /health endpoint returns only status (ok/degraded) for load balancers.
 */
router.get('/health', async (req, res) => {
    const { getDatabase } = require('../config/database');
    const config = require('../config/config');
    const { getIngestionStatus } = require('../ingestion/noaa-ingestor');
    const { getCircuitBreakerState } = require('../ingestion/utils/api-client');
    const IngestionEvent = require('../models/ingestionEvent');

    const mem = process.memoryUsage();

    const health = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: config.env,
        uptime: {
            seconds: Math.floor(process.uptime()),
            human: (() => {
                const s = Math.floor(process.uptime());
                const h = Math.floor(s / 3600);
                const m = Math.floor((s % 3600) / 60);
                return `${h}h ${m}m ${s % 60}s`;
            })()
        },
        memory: {
            heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
            heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
            rssMb: Math.round(mem.rss / 1024 / 1024),
            externalMb: Math.round(mem.external / 1024 / 1024)
        },
        noaaCircuitBreaker: getCircuitBreakerState(),
        checks: {
            database: { status: 'unknown' },
            ingestion: { status: 'unknown' },
            data_integrity: { status: 'unknown' }
        },
        ingestion: getIngestionStatus()
    };

    try {
        const db = getDatabase();
        await db.query('SELECT 1');
        health.checks.database = {
            status: 'ok',
            message: 'Database connection successful'
        };
    } catch (error) {
        health.status = 'degraded';
        health.checks.database = {
            status: 'error',
            message: error.message
        };
    }

    try {
        const last = await IngestionEvent.getLastSuccessful();
        if (last) {
            health.checks.ingestion = {
                status: last.minutesAgo <= 30 ? 'ok' : 'stale',
                lastUpdated: last.lastUpdated,
                minutesAgo: last.minutesAgo,
                message:
                    last.minutesAgo <= 30
                        ? 'Ingestion is current'
                        : `Last ingestion was ${last.minutesAgo} minutes ago (expected: <= 30 min)`
            };

            if (last.minutesAgo > 30) {
                health.status = 'degraded';
            }
        } else {
            health.checks.ingestion = {
                status: 'unknown',
                message: 'No ingestion history found (ingestion may not have run yet)'
            };
        }
    } catch (error) {
        health.checks.ingestion = {
            status: 'error',
            message: `Error checking ingestion status: ${error.message}`
        };
    }

    try {
        const db = getDatabase();

        const [missingUgc] = await db.query(
            "SELECT COUNT(*) as count FROM offices WHERE ugc_codes IS NULL OR ugc_codes = '[]'"
        );
        const [missingCounty] = await db.query(
            "SELECT COUNT(*) as count FROM offices WHERE county IS NULL OR county = ''"
        );
        const [invalidFormat] = await db.query(
            `SELECT COUNT(*) as count FROM offices
       WHERE ugc_codes IS NOT NULL
       AND ugc_codes NOT REGEXP '"[A-Z]{2}[ZC][0-9]{3}"'`
        );

        const ugcMissing = missingUgc[0]?.count || 0;
        const countyMissing = missingCounty[0]?.count || 0;
        const formatInvalid = invalidFormat[0]?.count || 0;

        if (ugcMissing === 0 && countyMissing === 0 && formatInvalid === 0) {
            health.checks.data_integrity = {
                status: 'ok',
                message: 'All offices have valid UGC codes and county data'
            };
        } else {
            health.status = 'degraded';
            health.checks.data_integrity = {
                status: 'warning',
                message: 'Data integrity issues detected',
                details: {
                    sites_missing_ugc: ugcMissing,
                    sites_missing_county: countyMissing,
                    sites_invalid_ugc_format: formatInvalid
                }
            };
        }
    } catch (error) {
        health.checks.data_integrity = {
            status: 'error',
            message: `Error checking data integrity: ${error.message}`
        };
    }

    const httpStatus = health.status === 'ok' ? 200 : 503;
    res.status(httpStatus).json(health);
});

module.exports = router;
