'use strict';

/**
 * Unit tests for src/utils/alerting.js
 */

// Prevent actual HTTP requests
jest.mock('https', () => ({
  request: jest.fn()
}));
jest.mock('http', () => ({
  request: jest.fn()
}));

jest.mock('../../src/config/config', () => ({
  env: 'test'
}));

// We need to control ALERT_WEBHOOK_URL and ALERT_THROTTLE_MS
const ORIGINAL_ENV = process.env;

beforeEach(() => {
  jest.resetModules();
  process.env = { ...ORIGINAL_ENV };
  delete process.env.ALERT_WEBHOOK_URL;
  delete process.env.ALERT_EMAIL;
  delete process.env.ALERT_THROTTLE_MS;
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe('alerting module', () => {
  // ── formatSlackAlert ──────────────────────────────────────────────────

  describe('formatSlackAlert (via sendAlert)', () => {
    test('sendAlert logs critical alerts with console.error', async () => {
      const alerting = require('../../src/utils/alerting');
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await alerting.sendAlert({
        type: 'test_critical',
        severity: 'critical',
        title: 'Test Critical',
        message: 'Critical failure'
      });

      expect(spy).toHaveBeenCalledWith(expect.stringContaining('CRITICAL'));
      spy.mockRestore();
    });

    test('sendAlert logs warning alerts with console.warn', async () => {
      const alerting = require('../../src/utils/alerting');
      const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      await alerting.sendAlert({
        type: 'test_warning',
        severity: 'warning',
        title: 'Test Warning',
        message: 'Warning message'
      });

      expect(spy).toHaveBeenCalledWith(expect.stringContaining('WARNING'));
      spy.mockRestore();
    });
  });

  // ── shouldThrottle (via sendAlert) ────────────────────────────────────

  describe('throttling', () => {
    test('first alert is not throttled', async () => {
      const alerting = require('../../src/utils/alerting');
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      jest.spyOn(console, 'error').mockImplementation(() => {});

      const result = await alerting.sendAlert({
        type: 'unique_type_first',
        severity: 'warning',
        title: 'First',
        message: 'msg'
      });

      // sendAlert returns true when not throttled (even without webhook)
      expect(result).toBe(true);
      console.warn.mockRestore();
      console.error.mockRestore();
    });

    test('second alert of same type within throttle window is suppressed', async () => {
      // Use a very long throttle window
      process.env.ALERT_THROTTLE_MS = '60000';
      const alerting = require('../../src/utils/alerting');
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      jest.spyOn(console, 'error').mockImplementation(() => {});
      jest.spyOn(console, 'log').mockImplementation(() => {});

      await alerting.sendAlert({ type: 'dup_type', severity: 'warning', title: 'A', message: 'a' });
      const result = await alerting.sendAlert({ type: 'dup_type', severity: 'warning', title: 'B', message: 'b' });

      expect(result).toBe(false);
      console.warn.mockRestore();
      console.error.mockRestore();
      console.log.mockRestore();
    });

    test('different alert types are not throttled against each other', async () => {
      process.env.ALERT_THROTTLE_MS = '60000';
      const alerting = require('../../src/utils/alerting');
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      jest.spyOn(console, 'error').mockImplementation(() => {});

      await alerting.sendAlert({ type: 'type_a', severity: 'warning', title: 'A', message: 'a' });
      const result = await alerting.sendAlert({ type: 'type_b', severity: 'warning', title: 'B', message: 'b' });

      expect(result).toBe(true);
      console.warn.mockRestore();
      console.error.mockRestore();
    });
  });

  // ── sendWebhookAlert ────────────────────────────────────────────────

  describe('sendWebhookAlert (via sendAlert with webhook)', () => {
    test('sends webhook when ALERT_WEBHOOK_URL is set (https)', async () => {
      process.env.ALERT_WEBHOOK_URL = 'https://hooks.example.com/webhook';
      const https = require('https');

      // Mock the request to simulate a successful response
      const mockReq = {
        on: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        destroy: jest.fn()
      };
      https.request.mockImplementation((opts, cb) => {
        // Simulate a 200 response asynchronously
        process.nextTick(() => cb({ statusCode: 200 }));
        return mockReq;
      });

      const alerting = require('../../src/utils/alerting');
      jest.spyOn(console, 'error').mockImplementation(() => {});

      const result = await alerting.sendAlert({
        type: 'webhook_test_https',
        severity: 'critical',
        title: 'Webhook Test',
        message: 'Testing webhook'
      });

      expect(result).toBe(true);
      expect(https.request).toHaveBeenCalled();
      expect(mockReq.write).toHaveBeenCalled();
      expect(mockReq.end).toHaveBeenCalled();
      console.error.mockRestore();
    });

    test('sends webhook via http when URL is http://', async () => {
      process.env.ALERT_WEBHOOK_URL = 'http://hooks.example.com/webhook';
      const http = require('http');

      const mockReq = {
        on: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        destroy: jest.fn()
      };
      http.request.mockImplementation((opts, cb) => {
        process.nextTick(() => cb({ statusCode: 200 }));
        return mockReq;
      });

      const alerting = require('../../src/utils/alerting');
      jest.spyOn(console, 'error').mockImplementation(() => {});

      const result = await alerting.sendAlert({
        type: 'webhook_test_http',
        severity: 'critical',
        title: 'HTTP Webhook',
        message: 'Testing http webhook'
      });

      expect(result).toBe(true);
      expect(http.request).toHaveBeenCalled();
      console.error.mockRestore();
    });

    test('handles webhook request error gracefully', async () => {
      process.env.ALERT_WEBHOOK_URL = 'https://hooks.example.com/webhook';
      const https = require('https');

      const mockReq = {
        on: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        destroy: jest.fn()
      };
      https.request.mockImplementation(() => {
        // Trigger the error handler
        process.nextTick(() => {
          const errorHandler = mockReq.on.mock.calls.find(c => c[0] === 'error');
          if (errorHandler) errorHandler[1](new Error('Connection refused'));
        });
        return mockReq;
      });

      const alerting = require('../../src/utils/alerting');
      jest.spyOn(console, 'error').mockImplementation(() => {});

      const result = await alerting.sendAlert({
        type: 'webhook_error_test',
        severity: 'critical',
        title: 'Error Test',
        message: 'Testing error'
      });

      expect(result).toBe(true);
      console.error.mockRestore();
    });

    test('handles webhook timeout', async () => {
      process.env.ALERT_WEBHOOK_URL = 'https://hooks.example.com/webhook';
      const https = require('https');

      const mockReq = {
        on: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        destroy: jest.fn()
      };
      https.request.mockImplementation(() => {
        process.nextTick(() => {
          const timeoutHandler = mockReq.on.mock.calls.find(c => c[0] === 'timeout');
          if (timeoutHandler) timeoutHandler[1]();
        });
        return mockReq;
      });

      const alerting = require('../../src/utils/alerting');
      jest.spyOn(console, 'error').mockImplementation(() => {});

      const result = await alerting.sendAlert({
        type: 'webhook_timeout_test',
        severity: 'critical',
        title: 'Timeout Test',
        message: 'Testing timeout'
      });

      expect(result).toBe(true);
      console.error.mockRestore();
    });
  });

  // ── formatSlackAlert ────────────────────────────────────────────────

  describe('formatSlackAlert shape', () => {
    test('warning severity uses warning emoji and color', async () => {
      process.env.ALERT_WEBHOOK_URL = 'https://hooks.example.com/webhook';
      const https = require('https');
      let capturedPayload;

      const mockReq = {
        on: jest.fn(),
        write: jest.fn((data) => { capturedPayload = JSON.parse(data); }),
        end: jest.fn(),
        destroy: jest.fn()
      };
      https.request.mockImplementation((opts, cb) => {
        process.nextTick(() => cb({ statusCode: 200 }));
        return mockReq;
      });

      const alerting = require('../../src/utils/alerting');
      jest.spyOn(console, 'warn').mockImplementation(() => {});

      await alerting.sendAlert({
        type: 'format_test_warning',
        severity: 'warning',
        title: 'Format Test',
        message: 'Testing format'
      });

      expect(capturedPayload.text).toContain(':warning:');
      expect(capturedPayload.attachments[0].color).toBe('#ffc107');
      console.warn.mockRestore();
    });
  });

  // ── Convenience wrappers ──────────────────────────────────────────────

  describe('alertIngestionFailure', () => {
    test('sends alert with ingestion failure type', async () => {
      const alerting = require('../../src/utils/alerting');
      jest.spyOn(console, 'error').mockImplementation(() => {});

      const result = await alerting.alertIngestionFailure(new Error('NOAA timeout'), { consecutiveFailures: 1 });

      expect(result).toBe(true);
      console.error.mockRestore();
    });
  });

  describe('alertCleanupFailure', () => {
    test('sends alert with cleanup failure type', async () => {
      const alerting = require('../../src/utils/alerting');
      jest.spyOn(console, 'error').mockImplementation(() => {});

      const result = await alerting.alertCleanupFailure(new Error('cleanup fail'));

      expect(result).toBe(true);
      console.error.mockRestore();
    });
  });

  describe('alertAnomaly', () => {
    test('sends alert with anomaly type', async () => {
      const alerting = require('../../src/utils/alerting');
      jest.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await alerting.alertAnomaly('High advisory count', { count: 20 });

      expect(result).toBe(true);
      console.warn.mockRestore();
    });
  });

  describe('alertIngestionRecovery', () => {
    test('sends recovery alert', async () => {
      const alerting = require('../../src/utils/alerting');
      jest.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await alerting.alertIngestionRecovery({ previousConsecutiveFailures: 3 });

      expect(result).toBe(true);
      console.warn.mockRestore();
    });
  });

  // ── NEW TESTS: sendWebhookAlert ─────────────────────────────────────

  describe('sendWebhookAlert', () => {
    function createMockReqRes(statusCode) {
      const mockRes = { statusCode };
      const mockReq = {
        on: jest.fn().mockReturnThis(),
        write: jest.fn(),
        end: jest.fn(),
        destroy: jest.fn()
      };
      return { mockReq, mockRes };
    }

    test('returns false when no webhook URL is configured', async () => {
      // No ALERT_WEBHOOK_URL set
      const alerting = require('../../src/utils/alerting');
      jest.spyOn(console, 'warn').mockImplementation(() => {});

      // sendAlert without webhook returns true (logged but no webhook)
      // To test sendWebhookAlert directly, we check that sendAlert
      // does NOT call https.request
      const https = require('https');
      await alerting.sendAlert({
        type: 'no_webhook_test',
        severity: 'warning',
        title: 'No webhook',
        message: 'test'
      });

      expect(https.request).not.toHaveBeenCalled();
      console.warn.mockRestore();
    });

    test('sends HTTPS POST to configured webhook URL on success (2xx)', async () => {
      process.env.ALERT_WEBHOOK_URL = 'https://hooks.slack.com/services/T00/B00/xxx';
      const https = require('https');

      const { mockReq, mockRes } = createMockReqRes(200);
      https.request.mockImplementation((options, callback) => {
        callback(mockRes);
        return mockReq;
      });

      const alerting = require('../../src/utils/alerting');
      jest.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await alerting.sendAlert({
        type: 'webhook_success_test',
        severity: 'warning',
        title: 'Webhook Success',
        message: 'payload delivered'
      });

      expect(result).toBe(true);
      expect(https.request).toHaveBeenCalledTimes(1);
      const callOptions = https.request.mock.calls[0][0];
      expect(callOptions.hostname).toBe('hooks.slack.com');
      expect(callOptions.method).toBe('POST');
      expect(callOptions.headers['Content-Type']).toBe('application/json');
      expect(mockReq.write).toHaveBeenCalledWith(expect.any(String));
      expect(mockReq.end).toHaveBeenCalled();
      console.warn.mockRestore();
    });

    test('resolves false when webhook returns non-2xx status', async () => {
      process.env.ALERT_WEBHOOK_URL = 'https://hooks.slack.com/services/T00/B00/xxx';
      const https = require('https');

      const { mockReq, mockRes } = createMockReqRes(500);
      https.request.mockImplementation((options, callback) => {
        callback(mockRes);
        return mockReq;
      });

      const alerting = require('../../src/utils/alerting');
      jest.spyOn(console, 'warn').mockImplementation(() => {});

      // sendAlert still returns true (the alert itself was logged), but
      // internally sendWebhookAlert resolves false. We verify the request was made.
      const result = await alerting.sendAlert({
        type: 'webhook_fail_status_test',
        severity: 'warning',
        title: 'Webhook Fail',
        message: 'server error'
      });

      expect(result).toBe(true);
      expect(https.request).toHaveBeenCalled();
      console.warn.mockRestore();
    });

    test('resolves false on request error event', async () => {
      process.env.ALERT_WEBHOOK_URL = 'https://hooks.slack.com/services/T00/B00/xxx';
      const https = require('https');

      const mockReq = {
        on: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        destroy: jest.fn()
      };
      // Capture the error handler and invoke it
      https.request.mockImplementation((options, callback) => {
        mockReq.on.mockImplementation((event, handler) => {
          if (event === 'error') {
            // Fire async to mimic real behavior
            setImmediate(() => handler(new Error('ECONNREFUSED')));
          }
          return mockReq;
        });
        return mockReq;
      });

      const alerting = require('../../src/utils/alerting');
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      jest.spyOn(console, 'error').mockImplementation(() => {});

      const result = await alerting.sendAlert({
        type: 'webhook_error_event_test',
        severity: 'warning',
        title: 'Error Event',
        message: 'conn refused'
      });

      expect(result).toBe(true);
      expect(console.error).toHaveBeenCalledWith(
        'Webhook alert failed:',
        'ECONNREFUSED'
      );
      console.warn.mockRestore();
      console.error.mockRestore();
    });

    test('resolves false and destroys request on timeout event', async () => {
      process.env.ALERT_WEBHOOK_URL = 'https://hooks.slack.com/services/T00/B00/xxx';
      const https = require('https');

      const mockReq = {
        on: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        destroy: jest.fn()
      };
      https.request.mockImplementation((options, callback) => {
        mockReq.on.mockImplementation((event, handler) => {
          if (event === 'timeout') {
            setImmediate(() => handler());
          }
          return mockReq;
        });
        return mockReq;
      });

      const alerting = require('../../src/utils/alerting');
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      jest.spyOn(console, 'error').mockImplementation(() => {});

      const result = await alerting.sendAlert({
        type: 'webhook_timeout_test',
        severity: 'warning',
        title: 'Timeout',
        message: 'timed out'
      });

      expect(result).toBe(true);
      expect(mockReq.destroy).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith('Webhook alert timed out');
      console.warn.mockRestore();
      console.error.mockRestore();
    });

    test('resolves false when webhook URL is invalid (catch block)', async () => {
      // Set an invalid URL that will cause new URL() to throw
      process.env.ALERT_WEBHOOK_URL = ':::not-a-valid-url';

      const alerting = require('../../src/utils/alerting');
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      jest.spyOn(console, 'error').mockImplementation(() => {});

      const result = await alerting.sendAlert({
        type: 'webhook_invalid_url_test',
        severity: 'warning',
        title: 'Invalid URL',
        message: 'bad url'
      });

      expect(result).toBe(true);
      expect(console.error).toHaveBeenCalledWith(
        'Webhook alert error:',
        expect.any(String)
      );
      console.warn.mockRestore();
      console.error.mockRestore();
    });

    test('uses http module for http:// webhook URLs', async () => {
      process.env.ALERT_WEBHOOK_URL = 'http://internal.webhook.local/alert';
      const http = require('http');

      const mockReq = {
        on: jest.fn().mockReturnThis(),
        write: jest.fn(),
        end: jest.fn(),
        destroy: jest.fn()
      };
      const mockRes = { statusCode: 200 };
      http.request.mockImplementation((options, callback) => {
        callback(mockRes);
        return mockReq;
      });

      const alerting = require('../../src/utils/alerting');
      jest.spyOn(console, 'warn').mockImplementation(() => {});

      await alerting.sendAlert({
        type: 'webhook_http_test',
        severity: 'warning',
        title: 'HTTP Test',
        message: 'plain http'
      });

      expect(http.request).toHaveBeenCalledTimes(1);
      const callOptions = http.request.mock.calls[0][0];
      expect(callOptions.hostname).toBe('internal.webhook.local');
      expect(callOptions.port).toBe(80);
      console.warn.mockRestore();
    });
  });

  // ── NEW TESTS: formatSlackAlert format validation ───────────────────

  describe('formatSlackAlert format validation', () => {
    test('critical severity produces rotating_light emoji and red color', async () => {
      process.env.ALERT_WEBHOOK_URL = 'https://hooks.slack.com/services/T00/B00/xxx';
      const https = require('https');

      let capturedPayload;
      const mockReq = {
        on: jest.fn().mockReturnThis(),
        write: jest.fn((data) => { capturedPayload = JSON.parse(data); }),
        end: jest.fn(),
        destroy: jest.fn()
      };
      const mockRes = { statusCode: 200 };
      https.request.mockImplementation((options, callback) => {
        callback(mockRes);
        return mockReq;
      });

      const alerting = require('../../src/utils/alerting');
      jest.spyOn(console, 'error').mockImplementation(() => {});

      await alerting.sendAlert({
        type: 'format_critical_test',
        severity: 'critical',
        title: 'Critical Alert',
        message: 'server down'
      });

      expect(capturedPayload.text).toContain(':rotating_light:');
      expect(capturedPayload.text).toContain('Critical Alert');
      expect(capturedPayload.attachments[0].color).toBe('#dc3545');
      expect(capturedPayload.attachments[0].fields[1].value).toBe('CRITICAL');
      console.error.mockRestore();
    });

    test('warning severity produces warning emoji and yellow color', async () => {
      process.env.ALERT_WEBHOOK_URL = 'https://hooks.slack.com/services/T00/B00/xxx';
      const https = require('https');

      let capturedPayload;
      const mockReq = {
        on: jest.fn().mockReturnThis(),
        write: jest.fn((data) => { capturedPayload = JSON.parse(data); }),
        end: jest.fn(),
        destroy: jest.fn()
      };
      const mockRes = { statusCode: 200 };
      https.request.mockImplementation((options, callback) => {
        callback(mockRes);
        return mockReq;
      });

      const alerting = require('../../src/utils/alerting');
      jest.spyOn(console, 'warn').mockImplementation(() => {});

      await alerting.sendAlert({
        type: 'format_warning_test',
        severity: 'warning',
        title: 'Warning Alert',
        message: 'disk usage high'
      });

      expect(capturedPayload.text).toContain(':warning:');
      expect(capturedPayload.text).toContain('Warning Alert');
      expect(capturedPayload.attachments[0].color).toBe('#ffc107');
      expect(capturedPayload.attachments[0].fields[1].value).toBe('WARNING');
      console.warn.mockRestore();
    });

    test('formatSlackAlert includes Type, Details, and Timestamp fields', async () => {
      process.env.ALERT_WEBHOOK_URL = 'https://hooks.slack.com/services/T00/B00/xxx';
      const https = require('https');

      let capturedPayload;
      const mockReq = {
        on: jest.fn().mockReturnThis(),
        write: jest.fn((data) => { capturedPayload = JSON.parse(data); }),
        end: jest.fn(),
        destroy: jest.fn()
      };
      const mockRes = { statusCode: 200 };
      https.request.mockImplementation((options, callback) => {
        callback(mockRes);
        return mockReq;
      });

      const alerting = require('../../src/utils/alerting');
      jest.spyOn(console, 'warn').mockImplementation(() => {});

      await alerting.sendAlert({
        type: 'format_fields_test',
        severity: 'warning',
        title: 'Field Check',
        message: 'check all fields'
      });

      const fields = capturedPayload.attachments[0].fields;
      expect(fields).toHaveLength(4);
      expect(fields[0].title).toBe('Type');
      expect(fields[0].value).toBe('format_fields_test');
      expect(fields[2].title).toBe('Details');
      expect(fields[2].value).toBe('check all fields');
      expect(fields[3].title).toBe('Timestamp');
      expect(fields[3].value).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      console.warn.mockRestore();
    });
  });

  // ── NEW TEST: alertIngestionRecovery with default context ───────────

  describe('alertIngestionRecovery with default context', () => {
    test('uses "unknown" fallback when no previousConsecutiveFailures provided', async () => {
      process.env.ALERT_WEBHOOK_URL = 'https://hooks.slack.com/services/T00/B00/xxx';
      const https = require('https');

      let capturedPayload;
      const mockReq = {
        on: jest.fn().mockReturnThis(),
        write: jest.fn((data) => { capturedPayload = JSON.parse(data); }),
        end: jest.fn(),
        destroy: jest.fn()
      };
      const mockRes = { statusCode: 200 };
      https.request.mockImplementation((options, callback) => {
        callback(mockRes);
        return mockReq;
      });

      const alerting = require('../../src/utils/alerting');
      jest.spyOn(console, 'warn').mockImplementation(() => {});

      // Call with empty context — no previousConsecutiveFailures
      await alerting.alertIngestionRecovery();

      const detailsField = capturedPayload.attachments[0].fields.find(f => f.title === 'Details');
      expect(detailsField.value).toContain('unknown');
      console.warn.mockRestore();
    });
  });
});
