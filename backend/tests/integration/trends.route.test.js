'use strict';

/**
 * Integration tests for /api/trends routes
 */

jest.mock('../../src/config/database', () => ({
  getDatabase: jest.fn(() => ({ query: jest.fn().mockResolvedValue([[{ 1: 1 }]]) })),
  initDatabase: jest.fn().mockResolvedValue(true),
  closeDatabase: jest.fn().mockResolvedValue(true)
}));

jest.mock('../../src/models/advisoryHistory', () => ({
  getAllTrends: jest.fn(),
  getTrend: jest.fn(),
  getHistoryForSite: jest.fn()
}));

jest.mock('../../src/models/office', () => ({
  getAll: jest.fn(),
  getById: jest.fn(),
  getByIds: jest.fn(),
  getStates: jest.fn(),
  getRegions: jest.fn()
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
const AdvisoryHistory = require('../../src/models/advisoryHistory');
const Office = require('../../src/models/office');

afterEach(() => jest.clearAllMocks());

const SAMPLE_OFFICE = { id: 42, office_code: '46201', name: 'Indianapolis', state: 'IN' };

// ── GET /api/trends ─────────────────────────────────────────────────────

describe('GET /api/trends', () => {
  test('returns enriched trends with office metadata', async () => {
    AdvisoryHistory.getAllTrends.mockResolvedValue([
      { office_id: 42, trend: 'increasing', first_count: 1, last_count: 4 }
    ]);
    Office.getByIds.mockResolvedValue([SAMPLE_OFFICE]);

    const res = await request(app).get('/api/trends');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].office).toEqual(expect.objectContaining({ office_code: '46201' }));
  });

  test('returns empty array when no trends', async () => {
    AdvisoryHistory.getAllTrends.mockResolvedValue([]);
    Office.getByIds.mockResolvedValue([]);

    const res = await request(app).get('/api/trends');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('passes days query param', async () => {
    AdvisoryHistory.getAllTrends.mockResolvedValue([]);
    Office.getByIds.mockResolvedValue([]);

    await request(app).get('/api/trends').query({ days: '14' });

    expect(AdvisoryHistory.getAllTrends).toHaveBeenCalledWith(14);
  });

  test('returns 500 on error', async () => {
    AdvisoryHistory.getAllTrends.mockRejectedValue(new Error('DB error'));

    const res = await request(app).get('/api/trends');

    expect(res.status).toBe(500);
  });
});

// ── GET /api/trends/:officeId ───────────────────────────────────────────

describe('GET /api/trends/:officeId', () => {
  test('returns trend for specific office', async () => {
    AdvisoryHistory.getTrend.mockResolvedValue({ trend: 'stable', first_count: 2, last_count: 2 });
    Office.getById.mockResolvedValue(SAMPLE_OFFICE);

    const res = await request(app).get('/api/trends/42');

    expect(res.status).toBe(200);
    expect(res.body.trend).toBe('stable');
    expect(res.body.office).toEqual(expect.objectContaining({ id: 42 }));
  });

  test('returns 500 on model error', async () => {
    AdvisoryHistory.getTrend.mockRejectedValue(new Error('fail'));

    const res = await request(app).get('/api/trends/42');

    expect(res.status).toBe(500);
  });
});

// ── GET /api/trends/:officeId/history ───────────────────────────────────

describe('GET /api/trends/:officeId/history', () => {
  test('returns history for specific office', async () => {
    const history = [
      { id: 1, office_id: 42, snapshot_time: '2026-03-10T06:00:00Z', advisory_count: 3 }
    ];
    AdvisoryHistory.getHistoryForSite.mockResolvedValue(history);
    Office.getById.mockResolvedValue(SAMPLE_OFFICE);

    const res = await request(app).get('/api/trends/42/history');

    expect(res.status).toBe(200);
    expect(res.body.office.id).toBe(42);
    expect(res.body.history).toHaveLength(1);
  });

  test('returns 500 on error', async () => {
    AdvisoryHistory.getHistoryForSite.mockRejectedValue(new Error('fail'));

    const res = await request(app).get('/api/trends/42/history');

    expect(res.status).toBe(500);
  });
});
