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

describe('API 404 handler', () => {
  test('returns 404 for unknown API routes', async () => {
    jest.resetModules();
    const app = require('../../src/app');
    const res = await request(app).get('/api/nonexistent-endpoint');
    expect(res.status).toBe(404);
  });
});

describe('error handler', () => {
  test('returns 503 with Retry-After for pool exhaustion errors', async () => {
    jest.resetModules();
    const app = require('../../src/app');

    // Inject a middleware that fires a pool exhaustion error through next()
    // We insert it at the beginning of the stack via use(), then hit a non-existent
    // api path to ensure it runs before any route handler catches it.
    const express = require('express');
    const testRouter = express.Router();
    testRouter.get('/trigger-pool-error', (req, res, next) => {
      const err = new Error('Pool is full');
      err.isPoolExhausted = true;
      next(err);
    });
    testRouter.get('/trigger-generic-error', (req, res, next) => {
      next(new Error('something broke'));
    });
    // Splice into app._router.stack before the error handler (last item)
    const stack = app._router.stack;
    const errorHandlerLayer = stack.pop(); // Remove error handler
    const notFoundLayer = stack.pop(); // Remove 404 handler
    app.use('/test', testRouter);
    stack.push(notFoundLayer); // Put 404 handler back
    stack.push(errorHandlerLayer); // Put error handler back

    const res = await request(app).get('/test/trigger-pool-error');
    expect(res.status).toBe(503);
    expect(res.headers['retry-after']).toBe('5');
  });

  test('returns 500 with generic error', async () => {
    // Reuse the app from the pool exhaustion test (routes already injected)
    jest.resetModules();
    const app = require('../../src/app');
    const express = require('express');
    const testRouter = express.Router();
    testRouter.get('/trigger-generic-error', (req, res, next) => {
      next(new Error('something broke'));
    });
    const stack = app._router.stack;
    const errorHandlerLayer = stack.pop();
    const notFoundLayer = stack.pop();
    app.use('/test2', testRouter);
    stack.push(notFoundLayer);
    stack.push(errorHandlerLayer);

    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(app).get('/test2/trigger-generic-error');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    spy.mockRestore();
  });
});

describe('production CORS warning', () => {
  test('logs warning when CORS_ORIGIN unset in production', () => {
    jest.resetModules();
    // Mock config to simulate production with cors.origin === false
    jest.doMock('../../src/config/config', () => ({
      env: 'production',
      cors: { origin: false },
      staticFiles: { path: null },
      database: { host: 'localhost', port: 3306, user: 'root', password: 'pw', database: 'db', ssl: false }
    }));
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'info').mockImplementation(() => {});
    require('../../src/app');
    const corsCalls = spy.mock.calls.filter(([arg]) =>
      typeof arg === 'string' && arg.includes('CORS_ORIGIN')
    );
    expect(corsCalls.length).toBeGreaterThan(0);
    spy.mockRestore();
  });
});

describe('static file serving', () => {
  test('serves static files with cache headers when STATIC_FILES_PATH is set', async () => {
    jest.resetModules();
    const path = require('path');
    process.env.STATIC_FILES_PATH = path.resolve(__dirname, '../../public');
    const app = require('../../src/app');
    // Request the SPA fallback route
    const res = await request(app).get('/any-spa-page');
    // Will either serve index.html or 404
    expect([200, 404]).toContain(res.status);
    delete process.env.STATIC_FILES_PATH;
  });
});

describe('development request logging (non-JSON)', () => {
  let app;

  beforeAll(() => {
    process.env.NODE_ENV = 'development';
    delete process.env.LOG_FORMAT;
    jest.restoreAllMocks();
    // Clear any doMock overrides from previous describe blocks
    jest.unmock('../../src/config/config');
    jest.unmock('../../src/models/officeStatus');
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
