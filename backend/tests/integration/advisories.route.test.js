'use strict';

/**
 * Integration tests for GET /api/advisories/active
 * Uses supertest against the Express app with AdvisoryModel mocked.
 */

jest.mock('../../src/config/database', () => ({
  getDatabase: jest.fn(),
  initDatabase: jest.fn().mockResolvedValue(true),
  closeDatabase: jest.fn().mockResolvedValue(true)
}));

jest.mock('../../src/models/advisory', () => ({
  getActive: jest.fn(),
  getAll:    jest.fn(),
  getRecentlyUpdated: jest.fn(),
  getCountBySeverity: jest.fn(),
  getById: jest.fn()
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
  TTL: {
    SHORT: 900,
    LONG: 3600,
    VERY_LONG: 86400
  }
}));

// Prevent scheduler from starting during tests
jest.mock('../../src/ingestion/scheduler', () => ({
  startScheduler:    jest.fn(),
  stopScheduler:     jest.fn(),
  getSchedulerStatus: jest.fn().mockReturnValue({ ingestion: { running: false, inProgress: false, consecutiveFailures: 0, intervalMinutes: 15 }, snapshot: { running: false, inProgress: false, consecutiveFailures: 0, intervalHours: 6 } }),
  waitForIngestionIdle: jest.fn().mockResolvedValue()
}));

const request    = require('supertest');
const app        = require('../../src/app');
const Advisory   = require('../../src/models/advisory');

const SAMPLE_ADVISORY = {
  id: 1,
  office_id: 1,
  advisory_type: 'Tornado Warning',
  severity: 'Extreme',
  status: 'active',
  source: 'NOAA',
  headline: 'Tornado Warning in effect',
  start_time: '2026-03-10T12:00:00Z',
  end_time:   '2026-03-10T15:00:00Z'
};

afterEach(() => jest.clearAllMocks());

describe('GET /api/advisories/active', () => {
  test('returns 200 with advisory list', async () => {
    Advisory.getActive.mockResolvedValue([SAMPLE_ADVISORY]);

    const res = await request(app).get('/api/advisories/active');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 1, advisory_type: 'Tornado Warning' })
    ]));
  });

  test('returns empty array when no active advisories', async () => {
    Advisory.getActive.mockResolvedValue([]);

    const res = await request(app).get('/api/advisories/active');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([]);
  });

  test('supports severity filter query param', async () => {
    Advisory.getActive.mockResolvedValue([SAMPLE_ADVISORY]);

    const res = await request(app)
      .get('/api/advisories/active')
      .query({ severity: 'Extreme' });

    expect(res.status).toBe(200);
  });

  test('returns 400 for invalid severity value', async () => {
    const res = await request(app)
      .get('/api/advisories/active')
      .query({ severity: '<script>alert(1)</script>' });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/advisories', () => {
  test('returns 200 with all advisories', async () => {
    Advisory.getAll.mockResolvedValue([SAMPLE_ADVISORY]);

    const res = await request(app).get('/api/advisories');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.count).toBe(1);
  });

  test('returns 500 when model throws', async () => {
    Advisory.getAll.mockRejectedValue(new Error('DB error'));

    const res = await request(app).get('/api/advisories');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/advisories/active (extended)', () => {
  test('supports pagination with page and limit', async () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ ...SAMPLE_ADVISORY, id: i + 1 }));
    Advisory.getActive.mockResolvedValue(items);

    const res = await request(app)
      .get('/api/advisories/active')
      .query({ page: '2', limit: '3' });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.total).toBe(10);
    expect(res.body.page).toBe(2);
    expect(res.body.pages).toBe(4);
  });

  test('uses filtered cache key for severity+state queries', async () => {
    Advisory.getActive.mockResolvedValue([SAMPLE_ADVISORY]);
    const cache = require('../../src/utils/cache');

    await request(app)
      .get('/api/advisories/active')
      .query({ severity: 'Extreme', state: 'FL' });

    expect(cache.set).toHaveBeenCalledWith(
      expect.stringContaining('advisories:filtered:'),
      expect.any(Object),
      300
    );
  });

  test('supports advisory_type filter', async () => {
    Advisory.getActive.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/advisories/active')
      .query({ advisory_type: 'Tornado Warning' });

    expect(res.status).toBe(200);
  });

  test('returns cache hit when available', async () => {
    const cache = require('../../src/utils/cache');
    const cached = { success: true, data: [SAMPLE_ADVISORY], count: 1 };
    cache.get.mockReturnValueOnce(cached);

    const res = await request(app).get('/api/advisories/active');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(cached);
  });

  test('returns 500 on model error', async () => {
    Advisory.getActive.mockRejectedValue(new Error('DB error'));

    const res = await request(app).get('/api/advisories/active');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/advisories/recent', () => {
  test('returns recently updated advisories', async () => {
    Advisory.getRecentlyUpdated.mockResolvedValue([SAMPLE_ADVISORY]);

    const res = await request(app).get('/api/advisories/recent');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
  });

  test('accepts limit param', async () => {
    Advisory.getRecentlyUpdated.mockResolvedValue([]);

    await request(app).get('/api/advisories/recent').query({ limit: '5' });

    expect(Advisory.getRecentlyUpdated).toHaveBeenCalledWith(expect.anything());
  });

  test('returns 500 on error', async () => {
    Advisory.getRecentlyUpdated.mockRejectedValue(new Error('fail'));

    const res = await request(app).get('/api/advisories/recent');

    expect(res.status).toBe(500);
  });
});

describe('GET /api/advisories/stats', () => {
  test('returns severity stats', async () => {
    Advisory.getCountBySeverity.mockResolvedValue([{ severity: 'Extreme', count: 5 }]);

    const res = await request(app).get('/api/advisories/stats');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.by_severity).toBeDefined();
  });

  test('returns 500 on error', async () => {
    Advisory.getCountBySeverity.mockRejectedValue(new Error('fail'));

    const res = await request(app).get('/api/advisories/stats');

    expect(res.status).toBe(500);
  });
});

describe('GET /api/advisories/:id', () => {
  test('returns 200 with advisory when found', async () => {
    Advisory.getById.mockResolvedValue(SAMPLE_ADVISORY);

    const res = await request(app).get('/api/advisories/1');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(1);
  });

  test('returns 404 when not found', async () => {
    Advisory.getById.mockResolvedValue(null);

    const res = await request(app).get('/api/advisories/9999');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  test('returns 400 for non-numeric id', async () => {
    const res = await request(app).get('/api/advisories/abc');

    expect(res.status).toBe(400);
  });

  test('returns 500 on error', async () => {
    Advisory.getById.mockRejectedValue(new Error('fail'));

    const res = await request(app).get('/api/advisories/1');

    expect(res.status).toBe(500);
  });
});

describe('GET /ping', () => {
  test('always returns 200 with no I/O', async () => {
    const res = await request(app).get('/ping');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('GET /api/version', () => {
  test('returns version from package.json', async () => {
    const res = await request(app).get('/api/version');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('version');
  });
});

describe('GET /api', () => {
  test('returns API info with endpoints', async () => {
    const res = await request(app).get('/api');

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Storm Scout API');
    expect(res.body.endpoints).toBeDefined();
  });
});

describe('API 404 handler', () => {
  test('returns 404 for unknown API routes', async () => {
    const res = await request(app).get('/api/nonexistent-route/something');

    expect(res.status).toBe(404);
  });
});

describe('Error handler middleware', () => {
  test('returns 503 for pool exhaustion errors', async () => {
    // Trigger pool exhaustion by making getActive throw with isPoolExhausted
    const Advisory = require('../../src/models/advisory');
    const err = new Error('Pool exhausted');
    err.isPoolExhausted = true;
    Advisory.getActive.mockRejectedValue(err);

    const res = await request(app).get('/api/advisories/active');

    expect(res.status).toBe(503);
    expect(res.headers['retry-after']).toBe('5');
  });
});
