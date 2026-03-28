'use strict';

/**
 * Integration tests for /api/status/overview and /health
 */

jest.mock('../../src/config/database', () => ({
  getDatabase: jest.fn(() => ({ query: jest.fn().mockResolvedValue([[{ 1: 1 }]]) })),
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
  getActive:          jest.fn(),
  getAll:             jest.fn(),
  getByOffice:        jest.fn(),
  getCountBySeverity: jest.fn()
}));

jest.mock('../../src/models/officeStatus', () => ({
  getByOffice:            jest.fn(),
  getCountByStatus:       jest.fn(),
  getCountByWeatherImpact: jest.fn(),
  getRecentlyUpdated:     jest.fn(),
  getImpacted:            jest.fn(),
  getAll:                 jest.fn()
}));

jest.mock('../../src/ingestion/noaa-ingestor', () => ({
  ingestNOAAData:       jest.fn(),
  getLastIngestionTime: jest.fn().mockResolvedValue({ lastUpdated: '2026-03-14T12:00:00Z' }),
  getIngestionStatus:   jest.fn()
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

const request      = require('supertest');
const app          = require('../../src/app');
const Office       = require('../../src/models/office');
const Advisory     = require('../../src/models/advisory');
const OfficeStatus = require('../../src/models/officeStatus');

afterEach(() => jest.clearAllMocks());

describe('GET /api/status/overview', () => {
  test('returns 200 with expected dashboard fields', async () => {
    Office.getAll.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    Advisory.getActive.mockResolvedValue([{ id: 10, office_id: 1 }]);
    Advisory.getCountBySeverity.mockResolvedValue([{ severity: 'Extreme', count: 1 }]);
    OfficeStatus.getCountByStatus.mockResolvedValue([{ operational_status: 'Open', count: 2 }]);
    OfficeStatus.getCountByWeatherImpact.mockResolvedValue([]);
    OfficeStatus.getRecentlyUpdated.mockResolvedValue([]);

    const res = await request(app).get('/api/status/overview');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const d = res.body.data;
    expect(d.total_offices).toBe(2);
    expect(d.total_active_advisories).toBe(1);
    expect(d.offices_with_advisories).toBe(1);
    expect(d).toHaveProperty('advisories_by_severity');
    expect(d).toHaveProperty('operational_status_counts');
    expect(d).toHaveProperty('update_interval_minutes');
  });
});

describe('GET /api/status/overview (extended)', () => {
  test('returns cache hit when available', async () => {
    const cache = require('../../src/utils/cache');
    const cached = { success: true, data: { total_offices: 5 } };
    cache.get.mockReturnValueOnce(cached);

    const res = await request(app).get('/api/status/overview');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(cached);
  });

  test('returns 500 on model error', async () => {
    Office.getAll.mockRejectedValue(new Error('DB fail'));

    const res = await request(app).get('/api/status/overview');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/status/overview — null ingestion time', () => {
  test('returns last_updated as null when no ingestion history', async () => {
    const { getLastIngestionTime } = require('../../src/ingestion/noaa-ingestor');
    getLastIngestionTime.mockResolvedValueOnce(null);

    Office.getAll.mockResolvedValue([{ id: 1 }]);
    Advisory.getActive.mockResolvedValue([]);
    Advisory.getCountBySeverity.mockResolvedValue([]);
    OfficeStatus.getCountByStatus.mockResolvedValue([]);
    OfficeStatus.getCountByWeatherImpact.mockResolvedValue([]);
    OfficeStatus.getRecentlyUpdated.mockResolvedValue([]);

    const res = await request(app).get('/api/status/overview');

    expect(res.status).toBe(200);
    expect(res.body.data.last_updated).toBeNull();
  });
});

describe('GET /api/status/timing', () => {
  test('returns authoritative timing metadata with no-store cache headers', async () => {
    const { getLastIngestionTime } = require('../../src/ingestion/noaa-ingestor');
    const { getSchedulerStatus } = require('../../src/ingestion/scheduler');

    getLastIngestionTime.mockResolvedValueOnce({ lastUpdated: '2026-03-21T18:45:00.000Z' });
    getSchedulerStatus.mockReturnValueOnce({
      ingestion: { running: true, inProgress: true, consecutiveFailures: 0, intervalMinutes: 15 },
      snapshot: { running: true, inProgress: false, consecutiveFailures: 0, intervalHours: 6 }
    });

    const res = await request(app).get('/api/status/timing');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.last_updated).toBe('2026-03-21T18:45:00.000Z');
    expect(res.body.data.ingestion_active).toBe(true);
    expect(res.body.data.scheduler_running).toBe(true);
    expect(res.body.data.update_interval_minutes).toBe(15);
    expect(Date.parse(res.body.data.server_time)).not.toBeNaN();
    expect(Date.parse(res.body.data.next_scheduled_update_at)).not.toBeNaN();
    expect(res.headers['cache-control']).toContain('no-store');
    expect(res.headers.pragma).toBe('no-cache');
    expect(res.headers.expires).toBe('0');
  });

  test('returns null last_updated when ingestion history is unavailable', async () => {
    const { getLastIngestionTime } = require('../../src/ingestion/noaa-ingestor');
    getLastIngestionTime.mockResolvedValueOnce(null);

    const res = await request(app).get('/api/status/timing');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.last_updated).toBeNull();
    expect(res.body.data).toHaveProperty('next_scheduled_update_at');
  });

  test('returns 500 when timing metadata lookup fails', async () => {
    const { getLastIngestionTime } = require('../../src/ingestion/noaa-ingestor');
    getLastIngestionTime.mockRejectedValueOnce(new Error('timing fetch failed'));

    const res = await request(app).get('/api/status/timing');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('timing fetch failed');
  });
});

describe('GET /api/status/offices-impacted', () => {
  test('returns 200 with impacted offices', async () => {
    OfficeStatus.getImpacted.mockResolvedValue([{ id: 1, operational_status: 'Closed' }]);

    const res = await request(app).get('/api/status/offices-impacted');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.count).toBe(1);
  });

  test('returns 500 on error', async () => {
    OfficeStatus.getImpacted.mockRejectedValue(new Error('fail'));

    const res = await request(app).get('/api/status/offices-impacted');

    expect(res.status).toBe(500);
  });
});

describe('GET /api/status/offices', () => {
  test('returns 200 with all office statuses', async () => {
    OfficeStatus.getAll.mockResolvedValue([{ id: 1, operational_status: 'Open' }]);

    const res = await request(app).get('/api/status/offices');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(1);
  });

  test('passes filter params', async () => {
    OfficeStatus.getAll.mockResolvedValue([]);

    await request(app).get('/api/status/offices').query({ operational_status: 'closed', state: 'FL' });

    expect(OfficeStatus.getAll).toHaveBeenCalledWith(expect.objectContaining({ operational_status: 'closed', state: 'FL' }));
  });

  test('returns 500 on error', async () => {
    OfficeStatus.getAll.mockRejectedValue(new Error('fail'));

    const res = await request(app).get('/api/status/offices');

    expect(res.status).toBe(500);
  });
});

describe('GET /health', () => {
  test('returns 200 ok when database is reachable', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body).toHaveProperty('timestamp');
  });

  test('returns 503 degraded when database query fails', async () => {
    const { getDatabase } = require('../../src/config/database');
    getDatabase.mockReturnValueOnce({
      query: jest.fn().mockRejectedValue(new Error('connection refused'))
    });

    const res = await request(app).get('/health');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
  });
});

describe('GET /api/status/overview (error handling)', () => {
  test('returns 500 when model throws', async () => {
    Office.getAll.mockRejectedValue(new Error('DB connection failed'));

    const res = await request(app).get('/api/status/overview');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  test('returns cached response when available', async () => {
    const cache = require('../../src/utils/cache');
    const cachedResponse = { success: true, data: { total_offices: 5 } };
    cache.get.mockReturnValueOnce(cachedResponse);

    const res = await request(app).get('/api/status/overview');

    expect(res.status).toBe(200);
    expect(res.body.data.total_offices).toBe(5);
    expect(Office.getAll).not.toHaveBeenCalled();
  });
});

describe('GET /api/status/overview — last_updated null branch', () => {
  test('sets last_updated to null when getLastIngestionTime returns null', async () => {
    const { getLastIngestionTime } = require('../../src/ingestion/noaa-ingestor');
    getLastIngestionTime.mockResolvedValueOnce(null);

    Office.getAll.mockResolvedValue([{ id: 1 }]);
    Advisory.getActive.mockResolvedValue([]);
    Advisory.getCountBySeverity.mockResolvedValue([]);
    OfficeStatus.getCountByStatus.mockResolvedValue([]);
    OfficeStatus.getCountByWeatherImpact.mockResolvedValue([]);
    OfficeStatus.getRecentlyUpdated.mockResolvedValue([]);

    const res = await request(app).get('/api/status/overview');

    expect(res.status).toBe(200);
    expect(res.body.data.last_updated).toBeNull();
  });
});

describe('GET /api/status/offices-impacted', () => {
  test('returns 200 with impacted offices', async () => {
    OfficeStatus.getImpacted.mockResolvedValue([
      { id: 1, office_code: '46201', operational_status: 'Closed' }
    ]);

    const res = await request(app).get('/api/status/offices-impacted');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.count).toBe(1);
  });

  test('returns empty array when no impacted offices', async () => {
    OfficeStatus.getImpacted.mockResolvedValue([]);

    const res = await request(app).get('/api/status/offices-impacted');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  test('returns 500 when model throws', async () => {
    OfficeStatus.getImpacted.mockRejectedValue(new Error('DB error'));

    const res = await request(app).get('/api/status/offices-impacted');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/status/offices', () => {
  test('returns 200 with all office statuses', async () => {
    OfficeStatus.getAll.mockResolvedValue([
      { id: 1, operational_status: 'Open' },
      { id: 2, operational_status: 'Closed' }
    ]);

    const res = await request(app).get('/api/status/offices');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(2);
  });

  test('passes filter params to model', async () => {
    OfficeStatus.getAll.mockResolvedValue([]);

    await request(app).get('/api/status/offices').query({ operational_status: 'closed', state: 'FL' });

    expect(OfficeStatus.getAll).toHaveBeenCalledWith(
      expect.objectContaining({ operational_status: 'closed', state: 'FL' })
    );
  });

  test('returns 500 when model throws', async () => {
    OfficeStatus.getAll.mockRejectedValue(new Error('DB error'));

    const res = await request(app).get('/api/status/offices');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});
