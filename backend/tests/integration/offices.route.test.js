'use strict';

/**
 * Integration tests for /api/offices routes
 * Uses supertest against the Express app with models mocked.
 */

jest.mock('../../src/config/database', () => ({
  getDatabase: jest.fn(),
  initDatabase: jest.fn().mockResolvedValue(true),
  closeDatabase: jest.fn().mockResolvedValue(true)
}));

jest.mock('../../src/models/office', () => ({
  getAll:    jest.fn(),
  getById:   jest.fn(),
  getStates: jest.fn(),
  getRegions: jest.fn()
}));

jest.mock('../../src/models/advisory', () => ({
  getActive:   jest.fn(),
  getAll:      jest.fn(),
  getByOffice: jest.fn()
}));

jest.mock('../../src/models/officeStatus', () => ({
  getByOffice:           jest.fn(),
  getCountByStatus:      jest.fn(),
  getCountByWeatherImpact: jest.fn(),
  getRecentlyUpdated:    jest.fn(),
  getImpacted:           jest.fn(),
  getAll:                jest.fn()
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

const request = require('supertest');
const app     = require('../../src/app');
const Office  = require('../../src/models/office');
const Advisory = require('../../src/models/advisory');
const OfficeStatus = require('../../src/models/officeStatus');

const SAMPLE_OFFICE = { id: 1, office_code: '46201', name: 'Indianapolis', city: 'Indianapolis', state: 'IN', latitude: 39.77, longitude: -86.16 };

afterEach(() => jest.clearAllMocks());

describe('GET /api/offices', () => {
  test('returns 200 with office list', async () => {
    Office.getAll.mockResolvedValue([SAMPLE_OFFICE]);

    const res = await request(app).get('/api/offices');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toEqual(expect.objectContaining({ office_code: '46201' }));
  });

  test('returns empty array when no offices', async () => {
    Office.getAll.mockResolvedValue([]);

    const res = await request(app).get('/api/offices');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.count).toBe(0);
  });

  test('passes state filter to model', async () => {
    Office.getAll.mockResolvedValue([SAMPLE_OFFICE]);

    await request(app).get('/api/offices').query({ state: 'IN' });

    expect(Office.getAll).toHaveBeenCalledWith(expect.objectContaining({ state: 'IN' }));
  });

  test('returns 400 for invalid state param', async () => {
    const res = await request(app).get('/api/offices').query({ state: '<script>' });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/offices/states', () => {
  test('returns 200 with states array', async () => {
    Office.getStates.mockResolvedValue(['CA', 'IN', 'NY']);

    const res = await request(app).get('/api/offices/states');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(['CA', 'IN', 'NY']);
  });
});

describe('GET /api/offices/:id', () => {
  test('returns 200 with office, status, and advisories', async () => {
    Office.getById.mockResolvedValue(SAMPLE_OFFICE);
    OfficeStatus.getByOffice.mockResolvedValue({ operational_status: 'Open' });
    Advisory.getByOffice.mockResolvedValue([]);

    const res = await request(app).get('/api/offices/1');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.office_code).toBe('46201');
    expect(res.body.data.status).toEqual({ operational_status: 'Open' });
  });

  test('returns 404 when office not found', async () => {
    Office.getById.mockResolvedValue(null);

    const res = await request(app).get('/api/offices/9999');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  test('returns 400 for non-numeric id', async () => {
    const res = await request(app).get('/api/offices/abc');

    expect(res.status).toBe(400);
  });
});
