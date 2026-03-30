'use strict';

/**
 * Integration tests for /api/notices routes
 * Covers GET /, /active, /stats, /:id
 */

jest.mock('../../src/config/database', () => ({
  getDatabase: jest.fn(() => ({ query: jest.fn().mockResolvedValue([[{ 1: 1 }]]) })),
  initDatabase: jest.fn().mockResolvedValue(true),
  closeDatabase: jest.fn().mockResolvedValue(true)
}));

jest.mock('../../src/models/notice', () => ({
  getAll: jest.fn(),
  getActive: jest.fn(),
  getById: jest.fn(),
  getCountByType: jest.fn()
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
const Notice = require('../../src/models/notice');

afterEach(() => jest.clearAllMocks());

const SAMPLE_NOTICE = { id: 1, notice_type: 'Emergency Declaration', jurisdiction_type: 'Federal', state: 'CA' };

// ── GET /api/notices ────────────────────────────────────────────────────

describe('GET /api/notices', () => {
  test('returns all notices', async () => {
    Notice.getAll.mockResolvedValue([SAMPLE_NOTICE]);

    const res = await request(app).get('/api/notices');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.count).toBe(1);
  });

  test('delegates to getActive when active_only=true', async () => {
    Notice.getActive.mockResolvedValue([]);

    const res = await request(app).get('/api/notices').query({ active_only: 'true' });

    expect(res.status).toBe(200);
    expect(Notice.getActive).toHaveBeenCalled();
    expect(Notice.getAll).not.toHaveBeenCalled();
  });

  test('passes filter params to model', async () => {
    Notice.getAll.mockResolvedValue([]);

    await request(app).get('/api/notices').query({ state: 'CA', jurisdiction_type: 'Federal' });

    expect(Notice.getAll).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'CA', jurisdiction_type: 'Federal' })
    );
  });

  test('returns 500 on model error', async () => {
    Notice.getAll.mockRejectedValue(new Error('DB error'));

    const res = await request(app).get('/api/notices');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

// ── GET /api/notices/stats ──────────────────────────────────────────────

describe('GET /api/notices/stats', () => {
  test('returns notice statistics', async () => {
    Notice.getCountByType.mockResolvedValue([{ type: 'Emergency Declaration', count: 3 }]);

    const res = await request(app).get('/api/notices/stats');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('by_type');
  });

  test('returns 500 on error', async () => {
    Notice.getCountByType.mockRejectedValue(new Error('fail'));

    const res = await request(app).get('/api/notices/stats');

    expect(res.status).toBe(500);
  });
});

// ── GET /api/notices/:id ────────────────────────────────────────────────

describe('GET /api/notices/:id', () => {
  test('returns notice by ID', async () => {
    Notice.getById.mockResolvedValue(SAMPLE_NOTICE);

    const res = await request(app).get('/api/notices/1');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.notice_type).toBe('Emergency Declaration');
  });

  test('returns 404 when notice not found', async () => {
    Notice.getById.mockResolvedValue(null);

    const res = await request(app).get('/api/notices/999');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  test('returns 400 for non-numeric id', async () => {
    const res = await request(app).get('/api/notices/abc');

    expect(res.status).toBe(400);
  });

  test('returns 500 on error', async () => {
    Notice.getById.mockRejectedValue(new Error('fail'));

    const res = await request(app).get('/api/notices/1');

    expect(res.status).toBe(500);
  });
});

// ── GET /api/notices/active ─────────────────────────────────────────────

describe('GET /api/notices/active', () => {
  test('returns active notices', async () => {
    Notice.getActive.mockResolvedValue([SAMPLE_NOTICE]);

    const res = await request(app).get('/api/notices/active');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.count).toBe(1);
  });

  test('returns 500 on error', async () => {
    Notice.getActive.mockRejectedValue(new Error('fail'));

    const res = await request(app).get('/api/notices/active');

    expect(res.status).toBe(500);
  });
});
