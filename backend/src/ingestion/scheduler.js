/**
 * Ingestion Scheduler
 * Schedules periodic weather data ingestion using node-cron
 *
 * @generated AI-authored (Claude, Warp) — vanilla JS by design
 */

const cron = require('node-cron');
const config = require('../config/config');
const { ingestNOAAData } = require('./noaa-ingestor');
const { alertIngestionFailure, alertIngestionRecovery } = require('../utils/alerting');
const { captureSnapshot } = require('../scripts/capture-historical-snapshot');
const { ingestionCycleDuration, ingestionAdvisoriesTotal } = require('../middleware/metrics');

let scheduledTask = null;
let snapshotTask = null;
let consecutiveFailures = 0;
let consecutiveSnapshotFailures = 0;
const MAX_CONSECUTIVE_FAILURES = 3;

// Concurrency guards — prevent overlapping runs if a task exceeds the cron interval
let isIngesting = false;
let isSnapshoting = false;

/**
 * Wait until isIngesting is false, then resolve.
 * The snapshot must never fire mid-ingestion — it would capture a
 * partially-updated state where some offices have new advisories and
 * others still reflect the prior run.
 *
 * @param {number} timeoutMs - Max wait before giving up (default 10 min)
 * @returns {Promise<void>}
 */
function waitForIngestionIdle(timeoutMs = 10 * 60 * 1000) {
    if (!isIngesting) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const poll = setInterval(() => {
            if (!isIngesting) {
                clearInterval(poll);
                resolve();
            } else if (Date.now() - start > timeoutMs) {
                clearInterval(poll);
                reject(new Error('Timed out waiting for ingestion to complete before snapshot'));
            }
        }, 5000); // poll every 5 seconds
    });
}

/**
 * Handle ingestion completion
 * @param {Error|null} error - Error if ingestion failed
 */
async function handleIngestionResult(error) {
    if (error) {
        consecutiveFailures++;
        console.error(`Ingestion failed (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}):`, error.message);

        // Alert only on the first failure to avoid notification spam.
        // Subsequent consecutive failures are logged but not re-alerted. (closes #103)
        if (consecutiveFailures === 1) {
            await alertIngestionFailure(error, {
                consecutiveFailures,
                maxConsecutiveFailures: MAX_CONSECUTIVE_FAILURES
            });
        }
    } else {
        if (consecutiveFailures > 0) {
            // Send an all-clear recovery alert so the team knows ingestion is healthy again.
            console.log(`Ingestion recovered after ${consecutiveFailures} failure(s)`);
            await alertIngestionRecovery({ previousConsecutiveFailures: consecutiveFailures });
        }
        consecutiveFailures = 0;
    }
}

let lastTimeoutAt = null;

/**
 * Run ingestNOAAData with an overall timeout.
 * Uses AbortController to cancel in-flight observation fetches on timeout.
 * @param {number} timeoutMs - Maximum duration for the ingestion cycle
 * @returns {Promise<Object>} Ingestion result or throws on timeout
 */
async function runIngestionWithTimeout(timeoutMs) {
    const controller = new AbortController();
    const { signal } = controller;
    let timer;

    const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
            controller.abort();
            reject(new Error(`Ingestion cycle exceeded ${Math.round(timeoutMs / 1000)}s timeout`));
        }, timeoutMs);
        if (timer.unref) timer.unref();
    });

    try {
        return await Promise.race([
            ingestNOAAData({ signal }),
            timeoutPromise
        ]);
    } finally {
        clearTimeout(timer);
        controller.abort();
    }
}

/**
 * Start the ingestion scheduler
 */
function startScheduler() {
    if (scheduledTask) {
        console.warn('Scheduler already running');
        return;
    }

    const intervalMinutes = config.ingestion.intervalMinutes;

    // Convert minutes to cron expression
    // Run every N minutes: */N * * * *
    const cronExpression = `*/${intervalMinutes} * * * *`;

    console.log(`Starting ingestion scheduler: every ${intervalMinutes} minutes`);
    console.log(`Cron expression: ${cronExpression}\n`);

    // Schedule the NOAA ingestion task
    scheduledTask = cron.schedule(cronExpression, async () => {
        if (isIngesting) {
            console.warn('[Scheduler] Ingestion skipped — previous run still in progress');
            return;
        }
        isIngesting = true;
        const stopTimer = ingestionCycleDuration.startTimer();
        try {
            const result = await runIngestionWithTimeout(config.ingestion.maxDurationMs);
            if (result && result.advisoriesCreated) {
                ingestionAdvisoriesTotal.inc(result.advisoriesCreated);
            }
            await handleIngestionResult(null);
        } catch (error) {
            if (error.message?.includes('timeout')) {
                lastTimeoutAt = new Date().toISOString();
            }
            await handleIngestionResult(error);
        } finally {
            stopTimer();
            isIngesting = false;
        }
    });

    // Schedule the historical snapshot task (every 6 hours at minute 0)
    // Cron: 0 */6 * * * (runs at 00:00, 06:00, 12:00, 18:00)
    const snapshotCronExpression = '0 */6 * * *';
    console.log(`Starting historical snapshot scheduler: every 6 hours`);
    console.log(`Cron expression: ${snapshotCronExpression}\n`);

    snapshotTask = cron.schedule(snapshotCronExpression, async () => {
        if (isSnapshoting) {
            console.warn('[Scheduler] Snapshot skipped — previous run still in progress');
            return;
        }
        isSnapshoting = true;
        try {
            // Wait for any active ingestion to finish before capturing the snapshot.
            // A snapshot taken mid-ingestion would reflect a partially-updated state.
            if (isIngesting) {
                console.log('[Scheduler] Snapshot waiting for active ingestion to complete...');
                await waitForIngestionIdle();
                console.log('[Scheduler] Ingestion complete — proceeding with snapshot');
            }
            console.log('[Scheduler] Running historical snapshot...');
            const result = await captureSnapshot();
            consecutiveSnapshotFailures = 0;
            console.log(`[Scheduler] Snapshot completed: ${result.sites_captured} sites captured`);
        } catch (error) {
            consecutiveSnapshotFailures++;
            console.error(
                `[Scheduler] Snapshot failed (${consecutiveSnapshotFailures}/${MAX_CONSECUTIVE_FAILURES}):`,
                error.message
            );

            // Alert on persistent failures
            if (consecutiveSnapshotFailures >= MAX_CONSECUTIVE_FAILURES) {
                await alertIngestionFailure(error, {
                    type: 'Historical Snapshot',
                    consecutiveFailures: consecutiveSnapshotFailures,
                    maxConsecutiveFailures: MAX_CONSECUTIVE_FAILURES
                });
            }
        } finally {
            isSnapshoting = false;
        }
    });

    // Run initial ingestion immediately, then trigger the initial snapshot
    // once ingestion completes. Chaining via .finally() guarantees the snapshot
    // never fires mid-ingestion (closes the race condition from the old
    // setTimeout(5000) approach).
    console.log('Running initial ingestion...');
    isIngesting = true;
    runIngestionWithTimeout(config.ingestion.maxDurationMs)
        .then(() => handleIngestionResult(null))
        .catch((error) => {
            if (error.message?.includes('timeout')) {
                lastTimeoutAt = new Date().toISOString();
            }
            return handleIngestionResult(error);
        })
        .finally(async () => {
            isIngesting = false;

            // Capture initial historical snapshot now that ingestion is done
            if (isSnapshoting) return;
            isSnapshoting = true;
            try {
                console.log('[Scheduler] Running initial historical snapshot...');
                const result = await captureSnapshot();
                console.log(`[Scheduler] Initial snapshot completed: ${result.sites_captured} sites captured`);
            } catch (error) {
                console.error('[Scheduler] Initial snapshot failed:', error.message);
            } finally {
                isSnapshoting = false;
            }
        });
}

/**
 * Stop the ingestion scheduler
 */
function stopScheduler() {
    if (scheduledTask) {
        scheduledTask.stop();
        scheduledTask = null;
        consecutiveFailures = 0;
        console.log('Ingestion scheduler stopped');
    }

    if (snapshotTask) {
        snapshotTask.stop();
        snapshotTask = null;
        consecutiveSnapshotFailures = 0;
        console.log('Snapshot scheduler stopped');
    }
}

/**
 * Get scheduler status
 * @returns {Object} Scheduler status
 */
function getSchedulerStatus() {
    return {
        ingestion: {
            running: scheduledTask !== null,
            inProgress: isIngesting,
            consecutiveFailures,
            intervalMinutes: config.ingestion.intervalMinutes,
            maxDurationMs: config.ingestion.maxDurationMs,
            lastTimeoutAt
        },
        snapshot: {
            running: snapshotTask !== null,
            inProgress: isSnapshoting,
            consecutiveFailures: consecutiveSnapshotFailures,
            intervalHours: 6
        }
    };
}

module.exports = {
    startScheduler,
    stopScheduler,
    getSchedulerStatus,
    waitForIngestionIdle,
    // Exposed for testing
    _testing: { runIngestionWithTimeout }
};
