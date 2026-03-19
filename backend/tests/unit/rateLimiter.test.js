'use strict';

/**
 * Unit tests for rateLimiter middleware
 * Mocks express-rate-limit to capture config and test skip/handler functions.
 */

const configs = [];
jest.mock('express-rate-limit', () => {
  return jest.fn((config) => {
    configs.push(config);
    const middleware = (req, res, next) => next();
    return middleware;
  });
});

const { apiLimiter, writeLimiter, authLimiter, spaFallbackLimiter } = require('../../src/middleware/rateLimiter');
const [apiConfig, writeConfig, spaConfig, authConfig] = configs;

// apiConfig is configs[0] (has skip and handler)

beforeEach(() => jest.spyOn(console, 'error').mockImplementation());
afterEach(() => jest.restoreAllMocks());

describe('apiLimiter skip function', () => {
  test('returns true for /health path', () => {
    expect(apiConfig.skip({ path: '/health' })).toBe(true);
  });

  test('returns false for /offices path', () => {
    expect(apiConfig.skip({ path: '/offices' })).toBe(false);
  });

  test('returns false for root path', () => {
    expect(apiConfig.skip({ path: '/' })).toBe(false);
  });
});

describe('apiLimiter handler function', () => {
  test('logs rate limit info and returns 429 with message', () => {
    const req = {
      ip: '192.168.1.1',
      connection: { remoteAddress: '192.168.1.1' },
      headers: {
        'x-forwarded-for': '10.0.0.1',
        'user-agent': 'TestAgent/1.0'
      },
      path: '/api/offices'
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();
    const options = {
      statusCode: 429,
      message: apiConfig.message
    };

    apiConfig.handler(req, res, next, options);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('[RATE LIMIT]')
    );
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('192.168.1.1')
    );
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Too many requests, please try again later',
      retryAfter: '60 minutes'
    });
  });

  test('handles missing x-forwarded-for and user-agent', () => {
    const req = {
      ip: '127.0.0.1',
      connection: { remoteAddress: '127.0.0.1' },
      headers: {},
      path: '/api/test'
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    apiConfig.handler(req, res, jest.fn(), {
      statusCode: 429,
      message: apiConfig.message
    });

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });
});

describe('rate limiter configuration', () => {
  test('apiLimiter is created with correct window and max', () => {
    expect(apiConfig.windowMs).toBe(60 * 60 * 1000);
    expect(apiConfig.max).toBe(30000);
  });

  test('writeLimiter is created with correct window and max', () => {
    expect(writeConfig.windowMs).toBe(15 * 60 * 1000);
    expect(writeConfig.max).toBe(20);
  });

  test('spaFallbackLimiter is created with correct window and max', () => {
    expect(spaConfig.windowMs).toBe(15 * 60 * 1000);
    expect(spaConfig.max).toBe(600);
  });

  test('authLimiter is created with correct window and max', () => {
    expect(authConfig.windowMs).toBe(15 * 60 * 1000);
    expect(authConfig.max).toBe(10);
  });

  test('all limiters export middleware functions', () => {
    expect(typeof apiLimiter).toBe('function');
    expect(typeof writeLimiter).toBe('function');
    expect(typeof authLimiter).toBe('function');
    expect(typeof spaFallbackLimiter).toBe('function');
  });
});
