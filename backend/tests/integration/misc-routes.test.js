'use strict';

/**
 * Integration tests for /api/observations, /api/filters, /api/notices
 */

jest.mock('../../src/config/database', () => ({
  getDatabase: jest.fn(() => ({ query: jest.fn().mockResolvedValue([[{ 1: 1 }]]) })),
  initDatabase: jest.fn().mockResolvedValue(true),
  closeDatabase: jest.fn().mockResolvedValue(true)
}));

jest.mock('../../src/models/observation', () => ({
  getAll:          jest.fn(),
  getByOfficeCode: jest.fn()
}));

jest.mock('../../src/models/notice', () => ({
  getAll:         jest.fn(),
  getActive:      jest.fn(),
  getById:        jest.fn(),
  getCountByType: jest.fn()
}));

jest.mock('../../src/utils/cache', () => ({
  get:           jest.fn().mockReturnValue(null),
  set:           jest.fn(),
  invalidate:    jest.fn(),
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
  startScheduler:     jest.fn(),
  stopScheduler:      jest.fn(),
  getSchedulerStatus: jest.fn().mockReturnValue({ ingestion: { running: false, inProgress: false, consecutiveFailures: 0, intervalMinutes: 15 }, snapshot: { running: false, inProgress: false, consecutiveFailures: 0, intervalHours: 6 } }),
  waitForIngestionIdle: jest.fn().mockResolvedValue()
}));

const request     = require('supertest');
const app         = require('../../src/app');
const Observation = require('../../src/models/observation');
const Notice      = require('../../src/models/notice');

afterEach(() => jest.clearAllMocks());

// ── Observations ────────────────────────────────────────────────────────

describe('GET /api/observations', () => {
  test('returns 200 with observations array', async () => {
    Observation.getAll.mockResolvedValue([{ office_id: 1, temperature_c: 5.2 }]);

    const res = await request(app).get('/api/observations');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.count).toBe(1);
  });

  test('returns empty array when no observations', async () => {
    Observation.getAll.mockResolvedValue([]);

    const res = await request(app).get('/api/observations');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

describe('GET /api/observations/:officeCode', () => {
  test('returns 200 with single observation', async () => {
    Observation.getByOfficeCode.mockResolvedValue({ office_id: 1, temperature_c: 5.2 });

    const res = await request(app).get('/api/observations/46201');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('temperature_c');
  });

  test('returns 404 when no observation for office', async () => {
    Observation.getByOfficeCode.mockResolvedValue(null);

    const res = await request(app).get('/api/observations/00000');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

// ── Filters ─────────────────────────────────────────────────────────────

describe('GET /api/filters', () => {
  test('returns 200 with filter presets', async () => {
    const res = await request(app).get('/api/filters');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
  });
});

describe('GET /api/filters/types/all', () => {
  test('returns 200 with all 5 impact levels', async () => {
    const res = await request(app).get('/api/filters/types/all');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const levels = Object.keys(res.body.data);
    expect(levels).toEqual(expect.arrayContaining(['CRITICAL', 'HIGH', 'MODERATE', 'LOW', 'INFO']));
  });
});

describe('GET /api/filters/:filterName', () => {
  test('returns 404 for unknown filter preset', async () => {
    const res = await request(app).get('/api/filters/NONEXISTENT');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

// ── Notices ─────────────────────────────────────────────────────────────

describe('GET /api/notices/active', () => {
  test('returns 200 with active notices', async () => {
    Notice.getActive.mockResolvedValue([{ id: 1, notice_type: 'Emergency Declaration' }]);

    const res = await request(app).get('/api/notices/active');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
  });

  test('returns empty array when no active notices', async () => {
    Notice.getActive.mockResolvedValue([]);

    const res = await request(app).get('/api/notices/active');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.count).toBe(0);
  });
});
