/**
 * Ingestion Scheduler
 * Schedules periodic weather data ingestion using node-cron
 */

const cron = require('node-cron');
const config = require('../config/config');
const { ingestNOAAData } = require('./noaa-ingestor');

let scheduledTask = null;

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
    } catch (error) {
      console.error('Scheduled ingestion error:', error.message);
    }
  });
  
  // Run immediately on start
  console.log('Running initial ingestion...');
  ingestNOAAData().catch(error => {
    console.error('Initial ingestion error:', error.message);
  });
}

/**
 * Stop the ingestion scheduler
 */
function stopScheduler() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log('Ingestion scheduler stopped');
  }
}

module.exports = {
  startScheduler,
  stopScheduler
};
