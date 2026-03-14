'use strict';

/**
 * Integration tests for /api/history routes
 * These routes use getDatabase() directly (raw SQL) rather than model methods.
 */

const mockQuery = jest.fn();

jest.mock('../../src/models/ingestionEvent', () => ({
  getLastSuccessful: jest.fn().mockResolvedValue(null),
  recordStart: jest.fn(),
  recordSuccess: jest.fn(),
  recordFailure: jest.fn()
}));

jest.mock('../../src/config/database', () => ({
  getDatabase: jest.fn(() => ({ query: mockQuery })),
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

const SAMPLE_SNAPSHOT = {
  snapshot_time: '2026-03-14T06:00:00Z',
  extreme_count: 2, severe_count: 5, moderate_count: 10, minor_count: 20,
  offices_red: 1, offices_orange: 3, offices_yellow: 8, offices_green: 288,
  offices_closed: 0, offices_restricted: 1, offices_pending: 2, offices_open: 297,
  new_advisories: 5, continued_advisories: 30, upgraded_advisories: 2,
  total_advisories: 37, total_offices_with_advisories: 12
};

// ── GET /api/history/overview-trends ────────────────────────────────────

describe('GET /api/history/overview-trends', () => {
  test('returns trend data when snapshots exist', async () => {
    mockQuery.mockResolvedValue([[
      SAMPLE_SNAPSHOT,
      { ...SAMPLE_SNAPSHOT, snapshot_time: '2026-03-14T12:00:00Z', extreme_count: 3 }
    ]]);

    const res = await request(app).get('/api/history/overview-trends');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body).toHaveProperty('severity');
    expect(res.body).toHaveProperty('sitesByWeatherLevel');
    expect(res.body).toHaveProperty('trends');
    expect(res.body.timeRange.snapshotsAvailable).toBe(2);
  });

  test('returns no_data when no snapshots', async () => {
    mockQuery.mockResolvedValue([[]]);

    const res = await request(app).get('/api/history/overview-trends');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('no_data');
    expect(res.body.trends).toBeNull();
  });

  test('returns 500 on database error', async () => {
    mockQuery.mockRejectedValue(new Error('DB error'));

    const res = await request(app).get('/api/history/overview-trends');

    expect(res.status).toBe(500);
  });
});

// ── GET /api/history/severity-trends ────────────────────────────────────

describe('GET /api/history/severity-trends', () => {
  test('returns severity trend data', async () => {
    mockQuery.mockResolvedValue([[
      { snapshot_time: '2026-03-14T06:00:00Z', extreme_count: 1, severe_count: 3, moderate_count: 5, minor_count: 10 },
      { snapshot_time: '2026-03-14T12:00:00Z', extreme_count: 2, severe_count: 4, moderate_count: 5, minor_count: 8 }
    ]]);

    const res = await request(app).get('/api/history/severity-trends');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.trends).toHaveProperty('critical');
    expect(res.body.trends).toHaveProperty('high');
    expect(res.body).toHaveProperty('direction');
  });

  test('returns no_data when empty', async () => {
    mockQuery.mockResolvedValue([[]]);

    const res = await request(app).get('/api/history/severity-trends');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('no_data');
  });
});

// ── GET /api/history/office-trends/:officeId ────────────────────────────

describe('GET /api/history/office-trends/:officeId', () => {
  test('returns office-specific trends', async () => {
    // First query: office lookup; second: history
    mockQuery
      .mockResolvedValueOnce([[{ id: 1, office_code: '46201', name: 'Indianapolis', city: 'Indianapolis', state: 'IN' }]])
      .mockResolvedValueOnce([[
        { snapshot_time: '2026-03-14T06:00:00Z', advisory_count: 2, highest_severity: 'Moderate', highest_severity_type: 'Wind Advisory', has_extreme: 0, has_severe: 0, has_moderate: 1, new_count: 1, upgrade_count: 0 }
      ]]);

    const res = await request(app).get('/api/history/office-trends/1');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.office.office_code).toBe('46201');
    expect(res.body).toHaveProperty('trends');
    expect(res.body).toHaveProperty('current');
  });

  test('returns 404 when office not found', async () => {
    mockQuery.mockResolvedValue([[]]);

    const res = await request(app).get('/api/history/office-trends/999');

    expect(res.status).toBe(404);
  });

  test('returns no_data when office exists but no history', async () => {
    mockQuery
      .mockResolvedValueOnce([[{ id: 1, office_code: '46201', name: 'Indianapolis', city: 'Indianapolis', state: 'IN' }]])
      .mockResolvedValueOnce([[]]);

    const res = await request(app).get('/api/history/office-trends/1');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('no_data');
  });

  test('returns 400 for invalid officeId', async () => {
    const res = await request(app).get('/api/history/office-trends/abc');

    expect(res.status).toBe(400);
  });
});

// ── GET /api/history/data-availability ──────────────────────────────────

describe('GET /api/history/data-availability', () => {
  test('returns ready status when enough data', async () => {
    const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    mockQuery
      .mockResolvedValueOnce([[{ snapshot_count: 8, earliest_snapshot: oldDate, latest_snapshot: new Date().toISOString() }]])
      .mockResolvedValueOnce([[{ snapshot_count: 50 }]]);

    const res = await request(app).get('/api/history/data-availability');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
    expect(res.body).toHaveProperty('systemSnapshots');
    expect(res.body).toHaveProperty('siteSnapshots');
  });

  test('returns accumulating status when not enough data', async () => {
    const recentDate = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    mockQuery
      .mockResolvedValueOnce([[{ snapshot_count: 1, earliest_snapshot: recentDate, latest_snapshot: recentDate }]])
      .mockResolvedValueOnce([[{ snapshot_count: 5 }]]);

    const res = await request(app).get('/api/history/data-availability');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('accumulating');
  });
});
