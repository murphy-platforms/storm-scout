'use strict';

/**
 * Integration tests for /api/admin routes
 * All routes require API key authentication.
 */

jest.mock('../../src/config/database', () => ({
  getDatabase: jest.fn(() => ({ query: jest.fn().mockResolvedValue([[{ 1: 1 }]]) })),
  initDatabase: jest.fn().mockResolvedValue(true),
  closeDatabase: jest.fn().mockResolvedValue(true)
}));

jest.mock('../../src/models/auditLog', () => ({
  record: jest.fn().mockResolvedValue(),
  getRecent: jest.fn()
}));

jest.mock('../../src/models/ingestionEvent', () => ({
  getLastSuccessful: jest.fn()
}));

jest.mock('../../src/ingestion/noaa-ingestor', () => ({
  ingestNOAAData: jest.fn(),
  getLastIngestionTime: jest.fn().mockResolvedValue({ lastUpdated: '2026-03-14T12:00:00Z' }),
  getIngestionStatus: jest.fn().mockReturnValue({ active: false })
}));

jest.mock('../../src/ingestion/utils/api-client', () => ({
  getCircuitBreakerState: jest.fn().mockReturnValue({
    state: 'CLOSED', failureCount: 0, lastFailureTime: null, recoveryTimeMs: 60000
  }),
  getNOAAAlerts: jest.fn(),
  requestWithRetry: jest.fn()
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
const AuditLog = require('../../src/models/auditLog');
const IngestionEvent = require('../../src/models/ingestionEvent');
const { getSchedulerStatus, startScheduler, stopScheduler, waitForIngestionIdle } = require('../../src/ingestion/scheduler');
const { getDatabase } = require('../../src/config/database');

const API_KEY = 'test-admin-secret-key';

beforeAll(() => { process.env.API_KEY = API_KEY; });
afterAll(() => { delete process.env.API_KEY; });
afterEach(() => jest.clearAllMocks());

// ── Authentication ──────────────────────────────────────────────────────

describe('Admin API key enforcement', () => {
  test('returns 401 when X-Api-Key header is missing', async () => {
    const res = await request(app).get('/api/admin/status');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('returns 401 when X-Api-Key is wrong', async () => {
    const res = await request(app)
      .get('/api/admin/status')
      .set('X-Api-Key', 'wrong-key');
    expect(res.status).toBe(401);
  });
});

// ── POST /api/admin/pause-ingestion ─────────────────────────────────────

describe('POST /api/admin/pause-ingestion', () => {
  test('pauses running scheduler', async () => {
    getSchedulerStatus
      .mockReturnValueOnce({ ingestion: { running: true, inProgress: false } })
      .mockReturnValueOnce({ ingestion: { running: false, inProgress: false } });

    const res = await request(app)
      .post('/api/admin/pause-ingestion')
      .set('X-Api-Key', API_KEY);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(stopScheduler).toHaveBeenCalled();
    expect(AuditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'pause_ingestion' })
    );
  });

  test('returns success when scheduler already stopped', async () => {
    getSchedulerStatus.mockReturnValue({
      ingestion: { running: false, inProgress: false }
    });

    const res = await request(app)
      .post('/api/admin/pause-ingestion')
      .set('X-Api-Key', API_KEY);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/not running/i);
    expect(stopScheduler).not.toHaveBeenCalled();
  });

  test('waits for in-progress ingestion before completing', async () => {
    getSchedulerStatus
      .mockReturnValueOnce({ ingestion: { running: true, inProgress: true } })
      .mockReturnValueOnce({ ingestion: { running: false, inProgress: false } });

    const res = await request(app)
      .post('/api/admin/pause-ingestion')
      .set('X-Api-Key', API_KEY);

    expect(res.status).toBe(200);
    expect(waitForIngestionIdle).toHaveBeenCalled();
  });
});

// ── POST /api/admin/resume-ingestion ────────────────────────────────────

describe('POST /api/admin/resume-ingestion', () => {
  test('resumes stopped scheduler', async () => {
    getSchedulerStatus
      .mockReturnValueOnce({ ingestion: { running: false } })
      .mockReturnValueOnce({ ingestion: { running: true } });

    const res = await request(app)
      .post('/api/admin/resume-ingestion')
      .set('X-Api-Key', API_KEY);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(startScheduler).toHaveBeenCalled();
    expect(AuditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'resume_ingestion' })
    );
  });

  test('returns success when scheduler already running', async () => {
    getSchedulerStatus.mockReturnValue({ ingestion: { running: true } });

    const res = await request(app)
      .post('/api/admin/resume-ingestion')
      .set('X-Api-Key', API_KEY);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/already running/i);
    expect(startScheduler).not.toHaveBeenCalled();
  });
});

// ── GET /api/admin/status ───────────────────────────────────────────────

describe('GET /api/admin/status', () => {
  test('returns scheduler status', async () => {
    const res = await request(app)
      .get('/api/admin/status')
      .set('X-Api-Key', API_KEY);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBeDefined();
  });
});

// ── GET /api/admin/health ───────────────────────────────────────────────

describe('GET /api/admin/health', () => {
  test('returns 200 ok when all checks pass', async () => {
    IngestionEvent.getLastSuccessful.mockResolvedValue({
      lastUpdated: new Date().toISOString(), minutesAgo: 10
    });
    getDatabase.mockReturnValue({
      query: jest.fn().mockResolvedValue([[{ count: 0 }]])
    });

    const res = await request(app)
      .get('/api/admin/health')
      .set('X-Api-Key', API_KEY);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.checks.database.status).toBe('ok');
    expect(res.body.checks.ingestion.status).toBe('ok');
    expect(res.body).toHaveProperty('memory');
    expect(res.body).toHaveProperty('uptime');
    expect(res.body).toHaveProperty('noaaCircuitBreaker');
  });

  test('returns 503 when database fails', async () => {
    getDatabase.mockReturnValue({
      query: jest.fn().mockRejectedValue(new Error('Connection lost'))
    });

    const res = await request(app)
      .get('/api/admin/health')
      .set('X-Api-Key', API_KEY);

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.checks.database.status).toBe('error');
  });

  test('returns stale ingestion when last run > 30 min ago', async () => {
    IngestionEvent.getLastSuccessful.mockResolvedValue({
      lastUpdated: '2026-03-14T10:00:00Z', minutesAgo: 60
    });
    getDatabase.mockReturnValue({
      query: jest.fn().mockResolvedValue([[{ count: 0 }]])
    });

    const res = await request(app)
      .get('/api/admin/health')
      .set('X-Api-Key', API_KEY);

    expect(res.status).toBe(503);
    expect(res.body.checks.ingestion.status).toBe('stale');
  });
});

// ── GET /api/admin/audit-log ────────────────────────────────────────────

describe('GET /api/admin/audit-log', () => {
  test('returns recent audit entries', async () => {
    AuditLog.getRecent.mockResolvedValue([{ id: 1, action: 'pause_ingestion' }]);

    const res = await request(app)
      .get('/api/admin/audit-log')
      .set('X-Api-Key', API_KEY);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
  });

  test('respects limit parameter', async () => {
    AuditLog.getRecent.mockResolvedValue([]);

    await request(app)
      .get('/api/admin/audit-log')
      .query({ limit: '10' })
      .set('X-Api-Key', API_KEY);

    expect(AuditLog.getRecent).toHaveBeenCalledWith(10);
  });

  test('caps limit at 200', async () => {
    AuditLog.getRecent.mockResolvedValue([]);

    await request(app)
      .get('/api/admin/audit-log')
      .query({ limit: '999' })
      .set('X-Api-Key', API_KEY);

    expect(AuditLog.getRecent).toHaveBeenCalledWith(200);
  });

  test('returns 500 on audit-log error', async () => {
    AuditLog.getRecent.mockRejectedValue(new Error('DB fail'));

    const res = await request(app)
      .get('/api/admin/audit-log')
      .set('X-Api-Key', API_KEY);

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

// ── Error paths ─────────────────────────────────────────────────────────

describe('POST /api/admin/pause-ingestion error path', () => {
  test('returns 500 when pause throws', async () => {
    getSchedulerStatus.mockImplementation(() => { throw new Error('boom'); });

    const res = await request(app)
      .post('/api/admin/pause-ingestion')
      .set('X-Api-Key', API_KEY);

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe('POST /api/admin/resume-ingestion error path', () => {
  test('returns 500 when resume throws', async () => {
    getSchedulerStatus.mockImplementation(() => { throw new Error('boom'); });

    const res = await request(app)
      .post('/api/admin/resume-ingestion')
      .set('X-Api-Key', API_KEY);

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/admin/health data integrity warning', () => {
  test('returns degraded when offices have missing UGC/county', async () => {
    IngestionEvent.getLastSuccessful.mockResolvedValue({
      lastUpdated: new Date().toISOString(), minutesAgo: 10
    });
    // First call: SELECT 1 (db check), then 3 integrity queries
    const queryMock = jest.fn()
      .mockResolvedValueOnce([[{ 1: 1 }]])       // SELECT 1
      .mockResolvedValueOnce([[{ count: 5 }]])    // missing UGC
      .mockResolvedValueOnce([[{ count: 3 }]])    // missing county
      .mockResolvedValueOnce([[{ count: 1 }]]);   // invalid format
    getDatabase.mockReturnValue({ query: queryMock });

    const res = await request(app)
      .get('/api/admin/health')
      .set('X-Api-Key', API_KEY);

    expect(res.status).toBe(503);
    expect(res.body.checks.data_integrity.status).toBe('warning');
    expect(res.body.checks.data_integrity.details.sites_missing_ugc).toBe(5);
  });

  test('returns ingestion unknown when no history exists', async () => {
    IngestionEvent.getLastSuccessful.mockResolvedValue(null);
    getDatabase.mockReturnValue({
      query: jest.fn().mockResolvedValue([[{ count: 0 }]])
    });

    const res = await request(app)
      .get('/api/admin/health')
      .set('X-Api-Key', API_KEY);

    expect(res.body.checks.ingestion.status).toBe('unknown');
  });
});
