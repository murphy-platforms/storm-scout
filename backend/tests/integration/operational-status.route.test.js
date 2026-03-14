'use strict';

/**
 * Integration tests for /api/operational-status routes
 */

const mockQuery = jest.fn();

jest.mock('../../src/config/database', () => ({
  getDatabase: jest.fn(() => ({ query: mockQuery })),
  initDatabase: jest.fn().mockResolvedValue(true),
  closeDatabase: jest.fn().mockResolvedValue(true)
}));

jest.mock('../../src/models/ingestionEvent', () => ({
  getLastSuccessful: jest.fn().mockResolvedValue(null),
  recordStart: jest.fn(),
  recordSuccess: jest.fn(),
  recordFailure: jest.fn()
}));

jest.mock('../../src/models/officeStatus', () => ({
  getByOffice: jest.fn(),
  getCountByStatus: jest.fn(),
  getCountByWeatherImpact: jest.fn(),
  getRecentlyUpdated: jest.fn(),
  getImpacted: jest.fn(),
  getAll: jest.fn()
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
const OfficeStatus = require('../../src/models/officeStatus');

const API_KEY = 'test-ops-secret';

beforeAll(() => { process.env.API_KEY = API_KEY; });
afterAll(() => { delete process.env.API_KEY; });
afterEach(() => jest.clearAllMocks());

// ── POST stubs (501) ────────────────────────────────────────────────────

describe('POST /api/operational-status/offices/:id', () => {
  test('returns 501 Not Implemented', async () => {
    const res = await request(app)
      .post('/api/operational-status/offices/1')
      .set('X-Api-Key', API_KEY);

    expect(res.status).toBe(501);
    expect(res.body.success).toBe(false);
    expect(res.body.feature_status).toBe('planned');
  });
});

describe('POST /api/operational-status/bulk-update', () => {
  test('returns 501 Not Implemented', async () => {
    const res = await request(app)
      .post('/api/operational-status/bulk-update')
      .set('X-Api-Key', API_KEY);

    expect(res.status).toBe(501);
    expect(res.body.success).toBe(false);
  });
});

// ── GET /api/operational-status/offices/:id ─────────────────────────────

describe('GET /api/operational-status/offices/:id', () => {
  test('returns status for valid office', async () => {
    OfficeStatus.getByOffice.mockResolvedValue({
      operational_status: 'Open', weather_impact_level: 'green'
    });

    const res = await request(app)
      .get('/api/operational-status/offices/1')
      .set('X-Api-Key', API_KEY);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.operational_status).toBe('Open');
  });

  test('returns 404 when no status for office', async () => {
    OfficeStatus.getByOffice.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/operational-status/offices/999')
      .set('X-Api-Key', API_KEY);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  test('returns 500 on model error', async () => {
    OfficeStatus.getByOffice.mockRejectedValue(new Error('DB error'));

    const res = await request(app)
      .get('/api/operational-status/offices/1')
      .set('X-Api-Key', API_KEY);

    expect(res.status).toBe(500);
  });
});

// ── GET /api/operational-status/summary ─────────────────────────────────

describe('GET /api/operational-status/summary', () => {
  test('returns summary data', async () => {
    mockQuery
      .mockResolvedValueOnce([[
        { weather_impact_level: 'red', operational_status: 'closed', count: 1 }
      ]])
      .mockResolvedValueOnce([[
        { id: 10, office_code: '90210', name: 'Beverly Hills', state: 'CA',
          weather_impact_level: 'red', operational_status: 'open_normal', advisory_count: 3 }
      ]]);

    const res = await request(app)
      .get('/api/operational-status/summary')
      .set('X-Api-Key', API_KEY);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('summary');
    expect(res.body.data).toHaveProperty('needs_attention');
    expect(res.body.data.needs_attention_count).toBe(1);
  });

  test('returns 500 on database error', async () => {
    mockQuery.mockRejectedValue(new Error('DB error'));

    const res = await request(app)
      .get('/api/operational-status/summary')
      .set('X-Api-Key', API_KEY);

    expect(res.status).toBe(500);
  });
});
