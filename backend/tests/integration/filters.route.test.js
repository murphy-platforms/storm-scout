'use strict';

/**
 * Integration tests for /api/filters routes
 * Covers /types/:level and valid /:filterName (misc-routes handles /, /types/all, 404 preset)
 */

jest.mock('../../src/config/database', () => ({
  getDatabase: jest.fn(() => ({ query: jest.fn().mockResolvedValue([[{ 1: 1 }]]) })),
  initDatabase: jest.fn().mockResolvedValue(true),
  closeDatabase: jest.fn().mockResolvedValue(true)
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
  getSchedulerStatus: jest.fn().mockReturnValue({
    ingestion: { running: false, inProgress: false, consecutiveFailures: 0, intervalMinutes: 15 },
    snapshot: { running: false, inProgress: false, consecutiveFailures: 0, intervalHours: 6 }
  }),
  waitForIngestionIdle: jest.fn().mockResolvedValue()
}));

const request = require('supertest');
const app = require('../../src/app');

afterEach(() => jest.clearAllMocks());

// ── GET /api/filters/types/:level ───────────────────────────────────────

describe('GET /api/filters/types/:level', () => {
  test('returns CRITICAL alert types', async () => {
    const res = await request(app).get('/api/filters/types/CRITICAL');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.count).toBe(res.body.data.length);
  });

  test('handles case-insensitive level param', async () => {
    const res = await request(app).get('/api/filters/types/high');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  test('returns empty array for unknown level', async () => {
    const res = await request(app).get('/api/filters/types/UNKNOWN');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.count).toBe(0);
  });
});

// ── GET /api/filters/:filterName (valid presets) ────────────────────────

describe('GET /api/filters/:filterName (valid preset)', () => {
  test('returns OPERATIONS preset', async () => {
    const res = await request(app).get('/api/filters/OPERATIONS');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('name', 'Operations View');
  });

  test('handles case-insensitive filter name', async () => {
    const res = await request(app).get('/api/filters/executive');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('name', 'Executive Summary');
  });
});
