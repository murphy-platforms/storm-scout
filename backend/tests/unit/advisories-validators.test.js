'use strict';

/**
 * Unit tests for advisory route validators
 * Covers branch paths in severity and advisory_type custom validators
 */

jest.mock('../../src/config/database', () => ({
  getDatabase: jest.fn(() => ({ query: jest.fn().mockResolvedValue([[{ 1: 1 }]]) })),
  initDatabase: jest.fn().mockResolvedValue(true),
  closeDatabase: jest.fn().mockResolvedValue(true)
}));

jest.mock('../../src/models/advisory', () => ({
  getActive:          jest.fn().mockResolvedValue([]),
  getAll:             jest.fn().mockResolvedValue([]),
  getRecentlyUpdated: jest.fn().mockResolvedValue([]),
  getCountBySeverity: jest.fn().mockResolvedValue([]),
  getById:            jest.fn().mockResolvedValue(null)
}));

jest.mock('../../src/utils/cache', () => ({
  get: jest.fn().mockReturnValue(null),
  set: jest.fn(),
  invalidate: jest.fn(),
  invalidateAll: jest.fn(),
  CACHE_KEYS: {
    STATUS_OVERVIEW: 'status:overview',
    ALL_OFFICES: 'offices:all',
    ACTIVE_ADVISORIES: 'advisories:active',
    STATES_LIST: 'offices:states',
    REGIONS_LIST: 'offices:regions'
  },
  TTL: { SHORT: 900, LONG: 3600, VERY_LONG: 86400 }
}));

jest.mock('../../src/ingestion/scheduler', () => ({
  startScheduler: jest.fn(),
  stopScheduler: jest.fn(),
  getSchedulerStatus: jest.fn().mockReturnValue({ ingestion: { running: false, inProgress: false, consecutiveFailures: 0, intervalMinutes: 15 }, snapshot: { running: false, inProgress: false, consecutiveFailures: 0, intervalHours: 6 } }),
  waitForIngestionIdle: jest.fn().mockResolvedValue()
}));

const request = require('supertest');
const app = require('../../src/app');

afterEach(() => jest.clearAllMocks());

describe('Advisory route validators', () => {
  // Severity validator branches
  describe('severity validation', () => {
    test('accepts valid comma-separated severities', async () => {
      const res = await request(app)
        .get('/api/advisories/active')
        .query({ severity: 'Extreme,Severe' });

      expect(res.status).toBe(200);
    });

    test('rejects invalid severity value in comma list', async () => {
      const res = await request(app)
        .get('/api/advisories/active')
        .query({ severity: 'Extreme,INVALID' });

      expect(res.status).toBe(400);
    });

    test('accepts empty severity (optional param)', async () => {
      const res = await request(app).get('/api/advisories/active');

      expect(res.status).toBe(200);
    });
  });

  // Advisory type validator branches
  describe('advisory_type validation', () => {
    test('accepts valid advisory type', async () => {
      const res = await request(app)
        .get('/api/advisories/active')
        .query({ advisory_type: 'Tornado Warning' });

      expect(res.status).toBe(200);
    });

    test('rejects invalid advisory type', async () => {
      const res = await request(app)
        .get('/api/advisories/active')
        .query({ advisory_type: 'Fake Alert Type' });

      expect(res.status).toBe(400);
    });

    test('validates comma-separated advisory types', async () => {
      const res = await request(app)
        .get('/api/advisories/active')
        .query({ advisory_type: 'Tornado Warning,Fake Type' });

      expect(res.status).toBe(400);
    });
  });

  // Empty string edge cases (covers the `if (!value) return true` branches)
  describe('empty value edge cases', () => {
    test('severity with empty string passes validation', async () => {
      const res = await request(app)
        .get('/api/advisories/active')
        .query({ severity: '' });

      expect(res.status).toBe(200);
    });

    test('advisory_type with empty string passes validation', async () => {
      const res = await request(app)
        .get('/api/advisories/active')
        .query({ advisory_type: '' });

      expect(res.status).toBe(200);
    });
  });

  // Status validator branches
  describe('status validation (GET /api/advisories)', () => {
    test('accepts valid status', async () => {
      const Advisory = require('../../src/models/advisory');
      Advisory.getAll.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/advisories')
        .query({ status: 'active' });

      expect(res.status).toBe(200);
    });

    test('rejects invalid status', async () => {
      const res = await request(app)
        .get('/api/advisories')
        .query({ status: 'INVALID' });

      expect(res.status).toBe(400);
    });
  });
});
