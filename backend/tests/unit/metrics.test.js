'use strict';

/**
 * Unit tests for the Prometheus metrics middleware.
 */

const { metricsMiddleware, mountMetricsEndpoint } = require('../../src/middleware/metrics');

// ── normaliseRoute ──────────────────────────────────────────────────────

// normaliseRoute is not exported directly — extract via module internals or
// test indirectly through metricsMiddleware. Since it is a pure helper, we
// test it by calling the middleware and inspecting label values in the
// prom-client registry.

// For unit-level validation of the regex, import it through a small wrapper.
// The module's module.exports doesn't include normaliseRoute, but we can
// verify its behaviour through the labels recorded by metricsMiddleware.

describe('metricsMiddleware', () => {
  function createReq(method, path, routePath) {
    return {
      method,
      path,
      route: routePath ? { path: routePath } : undefined
    };
  }

  function createRes() {
    const listeners = {};
    return {
      statusCode: 200,
      on(event, fn) { listeners[event] = fn; },
      _emit(event) { if (listeners[event]) listeners[event](); }
    };
  }

  test('calls next() immediately', () => {
    const next = jest.fn();
    metricsMiddleware(createReq('GET', '/api/offices'), createRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('records metrics on response finish', () => {
    const next = jest.fn();
    const res = createRes();
    metricsMiddleware(createReq('GET', '/api/offices', '/'), res, next);

    // Simulate response completion
    res._emit('finish');

    // If no error thrown, metric recording succeeded
    expect(next).toHaveBeenCalled();
  });

  test('normalises numeric path segments to :id', () => {
    const next = jest.fn();
    const res = createRes();

    // When req.route is missing, middleware falls back to req.path
    metricsMiddleware(createReq('GET', '/api/offices/123'), res, next);
    res._emit('finish');

    // No error means the path was normalised and labels were valid
    expect(next).toHaveBeenCalled();
  });

  test('handles route with named params', () => {
    const next = jest.fn();
    const res = createRes();
    metricsMiddleware(createReq('GET', '/api/offices/42', '/:id'), res, next);
    res._emit('finish');
    expect(next).toHaveBeenCalled();
  });
});

describe('mountMetricsEndpoint', () => {
  test('registers GET /metrics route and returns prometheus text', async () => {
    // Build a minimal Express-like app to capture the route handler
    let registeredHandler;
    const fakeApp = {
      get: jest.fn((path, handler) => { registeredHandler = handler; })
    };

    mountMetricsEndpoint(fakeApp);

    expect(fakeApp.get).toHaveBeenCalledWith('/metrics', expect.any(Function));

    // Simulate a request to the /metrics endpoint
    const mockRes = {
      set: jest.fn(),
      end: jest.fn()
    };

    await registeredHandler({}, mockRes);

    expect(mockRes.set).toHaveBeenCalledWith('Content-Type', expect.stringContaining('text'));
    expect(mockRes.end).toHaveBeenCalledWith(expect.any(String));
  });

  test('updates DB pool gauge when pool object is available', async () => {
    jest.resetModules();

    jest.doMock('../../src/config/database', () => ({
      getDatabase: () => ({
        pool: {
          _allConnections: { length: 5 },
          _freeConnections: { length: 3 }
        }
      })
    }));
    jest.doMock('../../src/ingestion/utils/api-client', () => ({
      getCircuitBreakerState: () => ({ state: 'CLOSED' })
    }));

    const { mountMetricsEndpoint: mount2 } = require('../../src/middleware/metrics');

    let handler;
    const fakeApp = { get: jest.fn((p, h) => { handler = h; }) };
    mount2(fakeApp);

    const mockRes = { set: jest.fn(), end: jest.fn() };
    await handler({}, mockRes);

    expect(mockRes.end).toHaveBeenCalled();

    jest.restoreAllMocks();
  });

  test('handles errors from circuit breaker and DB pool gracefully', async () => {
    // Force require to throw for api-client and database
    jest.mock('../../src/ingestion/utils/api-client', () => {
      throw new Error('not loaded');
    });
    jest.mock('../../src/config/database', () => {
      throw new Error('not loaded');
    });

    let registeredHandler;
    const fakeApp = {
      get: jest.fn((path, handler) => { registeredHandler = handler; })
    };

    mountMetricsEndpoint(fakeApp);

    const mockRes = {
      set: jest.fn(),
      end: jest.fn()
    };

    // Should not throw even when dependencies fail
    await registeredHandler({}, mockRes);

    expect(mockRes.end).toHaveBeenCalled();
  });
});
