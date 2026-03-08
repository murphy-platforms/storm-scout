/**
 * Ingestion Scheduler
 * Schedules periodic weather data ingestion using node-cron
 */

const cron = require('node-cron');
const config = require('../config/config');
const { ingestNOAAData } = require('./noaa-ingestor');
const { alertIngestionFailure } = require('../utils/alerting');
const { captureSnapshot } = require('../scripts/capture-historical-snapshot');

let scheduledTask = null;
let snapshotTask = null;
let consecutiveFailures = 0;
let consecutiveSnapshotFailures = 0;
const MAX_CONSECUTIVE_FAILURES = 3;

/**
 * Handle ingestion completion
 * @param {Error|null} error - Error if ingestion failed
 */
async function handleIngestionResult(error) {
  if (error) {
    consecutiveFailures++;
    console.error(`Ingestion failed (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}):`, error.message);
    
    // Alert on first failure and after max consecutive failures
    if (consecutiveFailures === 1 || consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      await alertIngestionFailure(error, {
        consecutiveFailures,
        maxConsecutiveFailures: MAX_CONSECUTIVE_FAILURES
      });
    }
  } else {
    if (consecutiveFailures > 0) {
      console.log(`Ingestion recovered after ${consecutiveFailures} failure(s)`);
    }
    consecutiveFailures = 0;
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
    try {
      await ingestNOAAData();
      await handleIngestionResult(null);
    } catch (error) {
      await handleIngestionResult(error);
    }
  });
  
  // Schedule the historical snapshot task (every 6 hours at minute 0)
  // Cron: 0 */6 * * * (runs at 00:00, 06:00, 12:00, 18:00)
  const snapshotCronExpression = '0 */6 * * *';
  console.log(`Starting historical snapshot scheduler: every 6 hours`);
  console.log(`Cron expression: ${snapshotCronExpression}\n`);
  
  snapshotTask = cron.schedule(snapshotCronExpression, async () => {
    try {
      console.log('[Scheduler] Running historical snapshot...');
      const result = await captureSnapshot();
      consecutiveSnapshotFailures = 0;
      console.log(`[Scheduler] Snapshot completed: ${result.sites_captured} sites captured`);
    } catch (error) {
      consecutiveSnapshotFailures++;
      console.error(`[Scheduler] Snapshot failed (${consecutiveSnapshotFailures}/${MAX_CONSECUTIVE_FAILURES}):`, error.message);
      
      // Alert on persistent failures
      if (consecutiveSnapshotFailures >= MAX_CONSECUTIVE_FAILURES) {
        await alertIngestionFailure(error, {
          type: 'Historical Snapshot',
          consecutiveFailures: consecutiveSnapshotFailures,
          maxConsecutiveFailures: MAX_CONSECUTIVE_FAILURES
        });
      }
    }
  });
  
  // Run initial ingestion immediately
  console.log('Running initial ingestion...');
  ingestNOAAData()
    .then(() => handleIngestionResult(null))
    .catch(error => handleIngestionResult(error));
  
  // Run initial snapshot after 5 seconds (let ingestion complete first)
  console.log('Scheduling initial historical snapshot in 5 seconds...');
  setTimeout(async () => {
    try {
      console.log('[Scheduler] Running initial historical snapshot...');
      const result = await captureSnapshot();
      console.log(`[Scheduler] Initial snapshot completed: ${result.sites_captured} sites captured`);
    } catch (error) {
      console.error('[Scheduler] Initial snapshot failed:', error.message);
    }
  }, 5000);
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
      consecutiveFailures,
      intervalMinutes: config.ingestion.intervalMinutes
    },
    snapshot: {
      running: snapshotTask !== null,
      consecutiveFailures: consecutiveSnapshotFailures,
      intervalHours: 6
    }
  };
}

module.exports = {
  startScheduler,
  stopScheduler,
  getSchedulerStatus
};
