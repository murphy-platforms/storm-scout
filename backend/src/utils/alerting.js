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
    // 5-minute throttle window: prevents notification spam during rapid NOAA API
    // instability while still surfacing repeated failures to operators.
    // Each alert type has its own independent throttle bucket (keyed by type in
    // lastAlertTime) so a failure alert and its subsequent recovery alert do not
    // share a window and suppress each other.
    // Configurable via ALERT_THROTTLE_MS env var if the default is too aggressive.
    throttleMs: parseInt(process.env.ALERT_THROTTLE_MS) || 5 * 60 * 1000, // 5 minutes
    lastAlertTime: {}
};

/**
 * Determine whether an alert of the given type should be suppressed.
 * Prevents notification spam during sustained outages by enforcing a minimum
 * interval between alerts of the same type. Each alert type has an independent
 * throttle bucket so failure and recovery alerts (INGESTION_FAILURE vs.
 * INGESTION_RECOVERY) do not block each other — operators always see the
 * all-clear even if the failure was recently alerted.
 *
 * @param {string} alertType - AlertTypes constant (e.g. AlertTypes.INGESTION_FAILURE)
 * @returns {boolean} True if the alert should be suppressed; false if it should fire
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
 * POST an alert payload to the configured webhook URL.
 * Compatible with Slack incoming webhooks and any service that accepts a JSON
 * POST body (Discord, Teams, PagerDuty event webhooks, etc.).
 *
 * Expected payload shape (as produced by formatSlackAlert):
 * ```json
 * {
 *   "text": ":rotating_light: Storm Scout Alert: <title>",
 *   "attachments": [{
 *     "color": "#dc3545",
 *     "fields": [
 *       { "title": "Type",      "value": "<alertType>", "short": true },
 *       { "title": "Severity",  "value": "CRITICAL",    "short": true },
 *       { "title": "Details",   "value": "<message>",   "short": false },
 *       { "title": "Timestamp", "value": "<ISO string>","short": true }
 *     ]
 *   }]
 * }
 * ```
 *
 * Returns false without throwing when the webhook URL is not configured so
 * environments without alerting set up still function normally.
 *
 * @param {Object} payload - JSON-serialisable webhook payload
 * @returns {Promise<boolean>} True if the webhook returned 2xx; false otherwise
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
        attachments: [
            {
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
            }
        ]
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
 * Send a critical alert when the NOAA ingestion pipeline fails.
 * Uses AlertTypes.INGESTION_FAILURE as the throttle key so repeated failures
 * within the throttle window are suppressed — only the first failure in a streak
 * fires an alert; subsequent ones are logged to console only.
 *
 * @param {Error}  error          - The error that caused the ingestion failure
 * @param {Object} [context={}]   - Additional diagnostic context passed as metadata;
 *   common keys: consecutiveFailures {number}, maxConsecutiveFailures {number},
 *   type {string} (for snapshot failures)
 * @returns {Promise<boolean>} True if the alert was dispatched; false if throttled
 *   or no webhook is configured
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
 * Send an anomaly detection alert for unexpected system behaviour (e.g. advisory
 * count spikes, unexpected data shapes, duplicate rates above threshold).
 * Uses AlertTypes.ANOMALY_DETECTED as its throttle key.
 *
 * @param {string} message       - Human-readable description of the anomaly
 * @param {Object} [data={}]     - Supporting data for diagnostics (any serialisable shape)
 * @returns {Promise<boolean>} True if the alert was dispatched; false if throttled
 *   or no webhook is configured
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
 * Send an alert when the advisory cleanup process fails (expired/duplicate
 * advisory removal). Uses AlertTypes.CLEANUP_FAILURE as its throttle key.
 * Cleanup failures are non-critical but may indicate database issues and
 * should be investigated to prevent advisory table bloat.
 *
 * @param {Error} error - The error thrown by the cleanup process
 * @returns {Promise<boolean>} True if the alert was dispatched; false if throttled
 *   or no webhook is configured
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
 * Send an all-clear alert when ingestion succeeds after a failure streak.
 * Uses AlertTypes.INGESTION_RECOVERY as its throttle key — independent of the
 * failure key — so recovery alerts are never suppressed by a recent failure alert.
 *
 * @param {Object} [context={}] - Recovery context; common keys:
 *   previousConsecutiveFailures {number} — number of failures before recovery
 * @returns {Promise<boolean>} True if the alert was dispatched; false if throttled
 *   or no webhook is configured
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
