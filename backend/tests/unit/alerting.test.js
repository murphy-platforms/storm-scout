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
});
