'use strict';

/**
 * Unit tests for src/middleware/apiKey.js
 * No database dependency — uses only jest.fn() mocks.
 */

const { requireApiKey } = require('../../src/middleware/apiKey');

function makeReq(headerValue) {
  return { headers: { 'x-api-key': headerValue } };
}

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
}

const VALID_KEY = 'test-api-key-abc123';

beforeEach(() => {
  process.env.API_KEY = VALID_KEY;
});

afterEach(() => {
  delete process.env.API_KEY;
});

describe('requireApiKey middleware', () => {
  test('calls next() when key is valid', () => {
    const req  = makeReq(VALID_KEY);
    const res  = makeRes();
    const next = jest.fn();

    requireApiKey(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('returns 404 when X-Api-Key header is missing (hides admin routes)', () => {
    const req  = { headers: {} };
    const res  = makeRes();
    const next = jest.fn();

    requireApiKey(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  test('returns 404 when key is wrong (hides admin routes)', () => {
    const req  = makeReq('wrong-key');
    const res  = makeRes();
    const next = jest.fn();

    requireApiKey(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('returns 404 when key has correct length but wrong content', () => {
    // Same length as VALID_KEY but different bytes
    const sameLength = 'X'.repeat(VALID_KEY.length);
    const req  = makeReq(sameLength);
    const res  = makeRes();
    const next = jest.fn();

    requireApiKey(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('returns 404 when API_KEY env var is not set (fail-closed)', () => {
    delete process.env.API_KEY;

    const req  = makeReq(VALID_KEY);
    const res  = makeRes();
    const next = jest.fn();

    requireApiKey(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
