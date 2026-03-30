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
  getActive:          jest.fn(),
  getAll:             jest.fn(),
  getRecentlyUpdated: jest.fn(),
  getCountBySeverity: jest.fn(),
  getById:            jest.fn()
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

const API_KEY = 'test-admin-secret-key';

beforeAll(() => { process.env.API_KEY = API_KEY; });
afterAll(() => { delete process.env.API_KEY; });

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

});

describe('GET /api/advisories/active (caching & pagination)', () => {
  test('returns cached response when available', async () => {
    const cache = require('../../src/utils/cache');
    const cachedResponse = { success: true, data: [SAMPLE_ADVISORY], count: 1 };
    cache.get.mockReturnValueOnce(cachedResponse);

    const res = await request(app).get('/api/advisories/active');

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(Advisory.getActive).not.toHaveBeenCalled();
  });

  test('supports pagination with page and limit params', async () => {
    const items = Array.from({ length: 5 }, (_, i) => ({ ...SAMPLE_ADVISORY, id: i + 1 }));
    Advisory.getActive.mockResolvedValue(items);

    const res = await request(app)
      .get('/api/advisories/active')
      .query({ page: 2, limit: 2 });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.total).toBe(5);
    expect(res.body.pages).toBe(3);
    expect(res.body.page).toBe(2);
  });

  test('returns 500 when model throws', async () => {
    Advisory.getActive.mockRejectedValue(new Error('DB error'));

    const res = await request(app).get('/api/advisories/active');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  test('passes filter params with composite cache key', async () => {
    const cache = require('../../src/utils/cache');
    Advisory.getActive.mockResolvedValue([SAMPLE_ADVISORY]);

    const res = await request(app)
      .get('/api/advisories/active')
      .query({ severity: 'Extreme', state: 'FL' });

    expect(res.status).toBe(200);
    expect(Advisory.getActive).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'Extreme', state: 'FL' })
    );
    // Filtered results use a composite cache key and 300s TTL
    expect(cache.set).toHaveBeenCalledWith(
      expect.stringContaining('advisories:filtered:'),
      expect.objectContaining({ success: true }),
      300
    );
  });

  test('passes pool exhausted error to next() for 503 handling', async () => {
    const poolError = new Error('Pool exhausted');
    poolError.isPoolExhausted = true;
    Advisory.getActive.mockRejectedValue(poolError);

    const res = await request(app).get('/api/advisories/active');

    // Should be forwarded to error middleware, not handled as 500 in route
    expect(res.status).not.toBe(200);
  });

  test('paginated requests bypass cache entirely', async () => {
    const cache = require('../../src/utils/cache');
    const items = Array.from({ length: 3 }, (_, i) => ({ ...SAMPLE_ADVISORY, id: i + 1 }));
    Advisory.getActive.mockResolvedValue(items);

    const res = await request(app)
      .get('/api/advisories/active')
      .query({ page: 1, limit: 2 });

    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(2);
    // Paginated responses should not be cached
    expect(cache.set).not.toHaveBeenCalled();
  });
});

describe('GET /api/advisories', () => {
  test('returns 200 with all advisories', async () => {
    Advisory.getAll.mockResolvedValue([SAMPLE_ADVISORY]);

    const res = await request(app).get('/api/advisories');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
  });

  test('returns 500 when model throws', async () => {
    Advisory.getAll.mockRejectedValue(new Error('DB error'));

    const res = await request(app).get('/api/advisories');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/advisories/recent', () => {
  test('returns 200 with recent advisories', async () => {
    Advisory.getRecentlyUpdated.mockResolvedValue([SAMPLE_ADVISORY]);

    const res = await request(app).get('/api/advisories/recent');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('passes custom limit param to model', async () => {
    Advisory.getRecentlyUpdated.mockResolvedValue([SAMPLE_ADVISORY]);

    const res = await request(app)
      .get('/api/advisories/recent')
      .query({ limit: 5 });

    expect(res.status).toBe(200);
    expect(Advisory.getRecentlyUpdated).toHaveBeenCalledWith(5);
  });

  test('returns 500 on model error', async () => {
    Advisory.getRecentlyUpdated.mockRejectedValue(new Error('Recent query failed'));

    const res = await request(app).get('/api/advisories/recent');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Recent query failed');
  });
});

describe('GET /api/advisories/stats', () => {
  test('returns 200 with stats', async () => {
    Advisory.getCountBySeverity.mockResolvedValue([{ severity: 'Extreme', count: 3 }]);

    const res = await request(app).get('/api/advisories/stats');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('by_severity');
  });

  test('returns 500 on model error', async () => {
    Advisory.getCountBySeverity.mockRejectedValue(new Error('Stats query failed'));

    const res = await request(app).get('/api/advisories/stats');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Stats query failed');
  });
});

describe('GET /api/advisories/:id', () => {
  test('returns 200 when advisory found', async () => {
    Advisory.getById.mockResolvedValue(SAMPLE_ADVISORY);

    const res = await request(app).get('/api/advisories/1');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(1);
  });

  test('returns 404 when advisory not found', async () => {
    Advisory.getById.mockResolvedValue(null);

    const res = await request(app).get('/api/advisories/9999');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Advisory not found');
  });

  test('returns 500 on model error', async () => {
    Advisory.getById.mockRejectedValue(new Error('Unexpected error'));

    const res = await request(app).get('/api/advisories/1');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Unexpected error');
  });
});

describe('GET /ping', () => {
  test('always returns 200 with no I/O', async () => {
    const res = await request(app).get('/ping');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('App-level routes', () => {
  test('GET /api/version returns version from package.json', async () => {
    const res = await request(app).get('/api/version')
      .set('X-Api-Key', API_KEY);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('version');
  });

  test('GET /api/version without API key returns 404', async () => {
    const res = await request(app).get('/api/version');

    expect(res.status).toBe(404);
  });

  test('GET /api returns API info with endpoint listing', async () => {
    const res = await request(app).get('/api')
      .set('X-Api-Key', API_KEY);

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Storm Scout API');
    expect(res.body.endpoints).toHaveProperty('offices');
  });

  test('GET /api without API key returns 404', async () => {
    const res = await request(app).get('/api');

    expect(res.status).toBe(404);
  });

  test('GET /api/nonexistent returns 404', async () => {
    const res = await request(app).get('/api/nonexistent');

    expect(res.status).toBe(404);
  });

  test('GET /metrics returns prometheus metrics', async () => {
    const res = await request(app).get('/metrics')
      .set('X-Api-Key', API_KEY);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('http_requests_total');
  });

  test('GET /metrics without API key returns 404', async () => {
    const res = await request(app).get('/metrics');

    expect(res.status).toBe(404);
  });
});
