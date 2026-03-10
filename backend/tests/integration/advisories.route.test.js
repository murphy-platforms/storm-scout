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
  getAll:    jest.fn()
}));

jest.mock('../../src/utils/cache', () => ({
  get:           jest.fn().mockReturnValue(null),
  set:           jest.fn(),
  invalidate:    jest.fn(),
  invalidateAll: jest.fn()
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
    expect(res.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 1, advisory_type: 'Tornado Warning' })
    ]));
  });

  test('returns empty array when no active advisories', async () => {
    Advisory.getActive.mockResolvedValue([]);

    const res = await request(app).get('/api/advisories/active');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
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

describe('GET /ping', () => {
  test('always returns 200 with no I/O', async () => {
    const res = await request(app).get('/ping');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
