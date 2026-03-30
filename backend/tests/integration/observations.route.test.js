'use strict';

/**
 * Integration tests for /api/observations routes
 * Covers cache-hit path, not-found (404), and error handling
 */

jest.mock('../../src/config/database', () => ({
  getDatabase: jest.fn(() => ({ query: jest.fn().mockResolvedValue([[{ 1: 1 }]]) })),
  initDatabase: jest.fn().mockResolvedValue(true),
  closeDatabase: jest.fn().mockResolvedValue(true)
}));

jest.mock('../../src/models/observation', () => ({
  getAll: jest.fn(),
  getByOfficeCode: jest.fn()
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
const Observation = require('../../src/models/observation');
const cache = require('../../src/utils/cache');

afterEach(() => jest.clearAllMocks());

// ── GET /api/observations (cache + errors) ──────────────────────────────

describe('GET /api/observations (extended)', () => {
  test('returns cached response when available', async () => {
    const cached = { success: true, data: [{ office_id: 1 }], count: 1 };
    cache.get.mockReturnValueOnce(cached);

    const res = await request(app).get('/api/observations');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(cached);
    expect(Observation.getAll).not.toHaveBeenCalled();
  });

  test('returns 500 on model error', async () => {
    Observation.getAll.mockRejectedValue(new Error('DB error'));

    const res = await request(app).get('/api/observations');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

// ── GET /api/observations — temperature + observed_at in response ────────

describe('GET /api/observations (temperature data)', () => {
  test('response includes temperature_c and observed_at for frontend rendering', async () => {
    Observation.getAll.mockResolvedValue([{
      office_id: 1,
      office_code: '46201',
      office_name: 'Indianapolis',
      station_id: 'KIND',
      temperature_c: 18.5,
      observed_at: '2026-03-15T14:30:00Z',
      text_description: 'Partly Cloudy'
    }]);

    const res = await request(app).get('/api/observations');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data[0]).toEqual(expect.objectContaining({
      temperature_c: 18.5,
      observed_at: '2026-03-15T14:30:00Z',
      station_id: 'KIND'
    }));
  });
});

// ── GET /api/observations/:officeCode ────────────────────────────────────

describe('GET /api/observations/:officeCode (extended)', () => {
  test('returns observation with temperature and time for a specific office', async () => {
    Observation.getByOfficeCode.mockResolvedValue({
      office_id: 1,
      office_code: '46201',
      station_id: 'KIND',
      temperature_c: 22.1,
      observed_at: '2026-03-15T15:00:00Z'
    });

    const res = await request(app).get('/api/observations/46201');

    expect(res.status).toBe(200);
    expect(res.body.data.temperature_c).toBe(22.1);
    expect(res.body.data.observed_at).toBe('2026-03-15T15:00:00Z');
  });

  test('returns 404 when office not found', async () => {
    Observation.getByOfficeCode.mockResolvedValue(null);

    const res = await request(app).get('/api/observations/ZZZZ');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  test('returns 500 on model error', async () => {
    Observation.getByOfficeCode.mockRejectedValue(new Error('DB error'));

    const res = await request(app).get('/api/observations/46201');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});
