/**
 * Alerting Module
 * Handles notifications for system events like ingestion failures
 */

const https = require('https');
const http = require('http');
const config = require('../config/config');

// Alert configuration from environment
const ALERT_CONFIG = {
  webhookUrl: process.env.ALERT_WEBHOOK_URL || null,
  email: process.env.ALERT_EMAIL || null,
  // Throttle alerts to prevent spam (minimum time between alerts in ms)
  throttleMs: 5 * 60 * 1000,  // 5 minutes
  lastAlertTime: {}
};

/**
 * Check if we should throttle an alert
 * @param {string} alertType - Type of alert for throttling
 * @returns {boolean} True if should throttle
 */
function shouldThrottle(alertType) {
  const now = Date.now();
  const lastTime = ALERT_CONFIG.lastAlertTime[alertType] || 0;
  
  if (now - lastTime < ALERT_CONFIG.throttleMs) {
    return true;
  }
  
  ALERT_CONFIG.lastAlertTime[alertType] = now;
  return false;
}

/**
 * Send alert to configured webhook (Slack, Discord, etc.)
 * @param {Object} payload - Alert payload
 * @returns {Promise<boolean>} Success status
 */
async function sendWebhookAlert(payload) {
  if (!ALERT_CONFIG.webhookUrl) {
    return false;
  }
  
  return new Promise((resolve) => {
    try {
      const url = new URL(ALERT_CONFIG.webhookUrl);
      const isHttps = url.protocol === 'https:';
      const httpModule = isHttps ? https : http;
      
      const postData = JSON.stringify(payload);
      
      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 10000
      };
      
      const req = httpModule.request(options, (res) => {
        resolve(res.statusCode >= 200 && res.statusCode < 300);
      });
      
      req.on('error', (error) => {
        console.error('Webhook alert failed:', error.message);
        resolve(false);
      });
      
      req.on('timeout', () => {
        req.destroy();
        console.error('Webhook alert timed out');
        resolve(false);
      });
      
      req.write(postData);
      req.end();
    } catch (error) {
      console.error('Webhook alert error:', error.message);
      resolve(false);
    }
  });
}

/**
 * Format alert for Slack webhook
 * @param {Object} alert - Alert data
 * @returns {Object} Slack-formatted payload
 */
function formatSlackAlert(alert) {
  const emoji = alert.severity === 'critical' ? ':rotating_light:' : ':warning:';
  const color = alert.severity === 'critical' ? '#dc3545' : '#ffc107';
  
  return {
    text: `${emoji} Storm Scout Alert: ${alert.title}`,
    attachments: [{
      color: color,
      fields: [
        {
          title: 'Type',
          value: alert.type,
          short: true
        },
        {
          title: 'Severity',
          value: alert.severity.toUpperCase(),
          short: true
        },
        {
          title: 'Details',
          value: alert.message,
          short: false
        },
        {
          title: 'Timestamp',
          value: new Date().toISOString(),
          short: true
        }
      ]
    }]
  };
}

/**
 * Send an alert
 * @param {Object} options - Alert options
 * @param {string} options.type - Alert type (ingestion_failure, cleanup_failure, etc.)
 * @param {string} options.severity - Alert severity (warning, critical)
 * @param {string} options.title - Alert title
 * @param {string} options.message - Alert message/details
 * @param {Object} options.metadata - Additional metadata
 * @returns {Promise<boolean>} Whether alert was sent
 */
async function sendAlert({ type, severity = 'warning', title, message, metadata = {} }) {
  // Always log the alert
  const logMethod = severity === 'critical' ? console.error : console.warn;
  logMethod(`[ALERT] ${severity.toUpperCase()}: ${title} - ${message}`);
  
  // Check throttling
  if (shouldThrottle(type)) {
    console.log(`Alert throttled (type: ${type})`);
    return false;
  }
  
  const alert = {
    type,
    severity,
    title,
    message,
    metadata,
    timestamp: new Date().toISOString()
  };
  
  // Send to webhook if configured
  if (ALERT_CONFIG.webhookUrl) {
    const payload = formatSlackAlert(alert);
    await sendWebhookAlert(payload);
  }
  
  // Future: Add email alerting here
  // if (ALERT_CONFIG.email) {
  //   await sendEmailAlert(alert);
  // }
  
  return true;
}

/**
 * Enumeration of alert type identifiers used by alerting utility functions.
 * Each value is passed as the `type` field in alert payloads dispatched to
 * configured channels (webhook, email). Used for throttling logic — each type
 * has its own independent throttle window so failure and recovery alerts do
 * not share a throttle bucket.
 */
const AlertTypes = {
  INGESTION_FAILURE: 'ingestion_failure',
  INGESTION_RECOVERY: 'ingestion_recovery',
  INGESTION_PARTIAL: 'ingestion_partial',
  CLEANUP_FAILURE: 'cleanup_failure',
  DATABASE_ERROR: 'database_error',
  API_ERROR: 'api_error',
  ANOMALY_DETECTED: 'anomaly_detected'
};

/**
 * Send ingestion failure alert
 * @param {Error} error - The error that occurred
 * @param {Object} context - Additional context
 */
async function alertIngestionFailure(error, context = {}) {
  return sendAlert({
    type: AlertTypes.INGESTION_FAILURE,
    severity: 'critical',
    title: 'NOAA Ingestion Failed',
    message: error.message,
    metadata: {
      errorStack: error.stack,
      ...context
    }
  });
}

/**
 * Send anomaly detection alert
 * @param {string} message - Anomaly description
 * @param {Object} data - Anomaly data
 */
async function alertAnomaly(message, data = {}) {
  return sendAlert({
    type: AlertTypes.ANOMALY_DETECTED,
    severity: 'warning',
    title: 'Anomaly Detected',
    message,
    metadata: data
  });
}

/**
 * Send cleanup failure alert
 * @param {Error} error - The error that occurred
 */
async function alertCleanupFailure(error) {
  return sendAlert({
    type: AlertTypes.CLEANUP_FAILURE,
    severity: 'warning',
    title: 'Cleanup Process Failed',
    message: error.message,
    metadata: {
      errorStack: error.stack
    }
  });
}

/**
 * Send ingestion recovery alert (all-clear after a failure streak)
 * @param {Object} context - Recovery context (e.g., previousConsecutiveFailures)
 */
async function alertIngestionRecovery(context = {}) {
  return sendAlert({
    type: AlertTypes.INGESTION_RECOVERY,
    severity: 'warning',
    title: 'NOAA Ingestion Recovered',
    message: `Ingestion succeeded after ${context.previousConsecutiveFailures || 'unknown'} consecutive failure(s).`,
    metadata: context
  });
}

module.exports = {
  sendAlert,
  alertIngestionFailure,
  alertIngestionRecovery,
  alertAnomaly,
  alertCleanupFailure,
  AlertTypes
};
