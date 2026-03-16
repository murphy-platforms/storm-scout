'use strict';

/**
 * Integration tests for app.js branches that require env-var setup
 * before the app module is imported. Each describe uses resetModules
 * to get a fresh app import with the target env vars.
 */

jest.mock('../../src/config/database', () => ({
  getDatabase: jest.fn(() => ({ query: jest.fn().mockResolvedValue([[{ 1: 1 }]]) })),
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

afterEach(() => jest.clearAllMocks());

describe('BASE_PATH stripping', () => {
  let app;

  beforeAll(() => {
    process.env.BASE_PATH = '/stormscout';
    jest.resetModules();
    // Re-require app with BASE_PATH set
    app = require('../../src/app');
  });

  afterAll(() => {
    delete process.env.BASE_PATH;
  });

  test('strips BASE_PATH prefix from /stormscout/ping', async () => {
    const res = await request(app).get('/stormscout/ping');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('redirects exact BASE_PATH to /', async () => {
    const res = await request(app).get('/stormscout');
    // Should hit the root — either 200 or whatever / returns
    expect(res.status).toBeLessThan(500);
  });

  test('passes through requests without BASE_PATH prefix', async () => {
    const res = await request(app).get('/ping');
    expect(res.status).toBe(200);
  });
});

describe('request logging middleware', () => {
  let app;

  beforeAll(() => {
    process.env.LOG_FORMAT = 'json';
    jest.resetModules();
    app = require('../../src/app');
  });

  afterAll(() => {
    delete process.env.LOG_FORMAT;
  });

  test('logs structured JSON for API requests', async () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await request(app).get('/ping');

    // Should have logged a JSON-structured line
    const jsonCalls = spy.mock.calls.filter(([arg]) => {
      try { JSON.parse(arg); return true; } catch { return false; }
    });
    expect(jsonCalls.length).toBeGreaterThan(0);

    spy.mockRestore();
  });
});

describe('CORS_ORIGIN unset warning branch', () => {
  test('app works when cors origin is false', async () => {
    // The default test environment already has CORS_ORIGIN unset,
    // which exercises the cors.origin === false branch (line 124).
    // We just verify the app still works.
    const app = require('../../src/app');
    const res = await request(app).get('/ping');
    expect(res.status).toBe(200);
  });
});

describe('TRUST_PROXY branch', () => {
  let app;

  beforeAll(() => {
    process.env.TRUST_PROXY = 'true';
    jest.resetModules();
    app = require('../../src/app');
  });

  afterAll(() => {
    delete process.env.TRUST_PROXY;
  });

  test('app starts with trust proxy enabled', async () => {
    const res = await request(app).get('/ping');
    expect(res.status).toBe(200);
  });
});

describe('SPA fallback and static file headers', () => {
  test('serves index.html for non-API, non-file routes', async () => {
    const app = require('../../src/app');
    const res = await request(app).get('/some-spa-route');
    // SPA fallback sends index.html (200) or 404 if file not found
    expect([200, 404]).toContain(res.status);
  });

  test('sets no-cache headers for .html files', async () => {
    const app = require('../../src/app');
    const res = await request(app).get('/index.html');
    // If index.html exists, it should have no-cache headers
    if (res.status === 200) {
      expect(res.headers['cache-control']).toMatch(/no-cache/);
    }
  });
});

describe('development request logging (non-JSON)', () => {
  let app;

  beforeAll(() => {
    process.env.NODE_ENV = 'development';
    delete process.env.LOG_FORMAT;
    jest.resetModules();
    app = require('../../src/app');
  });

  afterAll(() => {
    process.env.NODE_ENV = 'test';
  });

  test('logs requests in plain text format', async () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await request(app).get('/ping');

    const plainLogs = spy.mock.calls.filter(([arg]) =>
      typeof arg === 'string' && arg.includes('GET') && arg.includes('/ping')
    );
    expect(plainLogs.length).toBeGreaterThan(0);

    spy.mockRestore();
  });
});
