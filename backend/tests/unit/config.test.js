'use strict';

/**
 * Unit tests for src/config/config.js
 * Tests the fail-fast startup validation for required env vars in production.
 */

describe('config.js — fail-fast validation', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    // Fresh env copy for each test; clear require cache so config re-evaluates
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test('exits with code 1 when required vars missing in production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.DB_USER;
    delete process.env.DB_PASSWORD;
    delete process.env.DB_NAME;
    delete process.env.NOAA_API_USER_AGENT;
    delete process.env.API_KEY;

    const mockExit  = jest.spyOn(process, 'exit').mockImplementation(() => {});
    const mockWrite = jest.spyOn(process.stderr, 'write').mockImplementation(() => {});

    require('../../src/config/config');

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockWrite).toHaveBeenCalledWith(expect.stringContaining('[FATAL]'));

    mockExit.mockRestore();
    mockWrite.mockRestore();
  });

  test('does NOT exit when all required vars are present in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.DB_USER = 'user';
    process.env.DB_PASSWORD = 'pass';
    process.env.DB_NAME = 'dbname';
    process.env.NOAA_API_USER_AGENT = 'StormScout/1.0';
    process.env.API_KEY = 'key123';

    const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {});

    const config = require('../../src/config/config');

    expect(mockExit).not.toHaveBeenCalled();
    expect(config.database.user).toBe('user');

    mockExit.mockRestore();
  });

  test('skips validation in development (default NODE_ENV)', () => {
    delete process.env.NODE_ENV;
    delete process.env.DB_USER;

    const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {});

    const config = require('../../src/config/config');

    expect(mockExit).not.toHaveBeenCalled();
    expect(config.env).toBe('development');

    mockExit.mockRestore();
  });

  test('parses CORS_ORIGIN correctly', () => {
    process.env.CORS_ORIGIN = 'https://a.com,https://b.com';

    const config = require('../../src/config/config');

    expect(config.cors.origin).toEqual(['https://a.com', 'https://b.com']);
  });
});
