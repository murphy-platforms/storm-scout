/**
 * Ingestion Scheduler
 * Schedules periodic weather data ingestion using node-cron
 */

const cron = require('node-cron');
const config = require('../config/config');
const { ingestNOAAData } = require('./noaa-ingestor');
const { alertIngestionFailure } = require('../utils/alerting');

let scheduledTask = null;
let consecutiveFailures = 0;
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
  
  // Schedule the task
  scheduledTask = cron.schedule(cronExpression, async () => {
    try {
      await ingestNOAAData();
      await handleIngestionResult(null);
    } catch (error) {
      await handleIngestionResult(error);
    }
  });
  
  // Run immediately on start
  console.log('Running initial ingestion...');
  ingestNOAAData()
    .then(() => handleIngestionResult(null))
    .catch(error => handleIngestionResult(error));
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
}

/**
 * Get scheduler status
 * @returns {Object} Scheduler status
 */
function getSchedulerStatus() {
  return {
    running: scheduledTask !== null,
    consecutiveFailures,
    intervalMinutes: config.ingestion.intervalMinutes
  };
}

module.exports = {
  startScheduler,
  stopScheduler,
  getSchedulerStatus
};
