'use strict';

/**
 * Unit tests for src/middleware/validate.js
 * Tests the express-validator error handler.
 */

const { validationResult } = require('express-validator');
const { handleValidationErrors } = require('../../src/middleware/validate');

jest.mock('express-validator', () => ({
  validationResult: jest.fn()
}));

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
}

afterEach(() => jest.clearAllMocks());

describe('handleValidationErrors middleware', () => {
  test('calls next() when there are no validation errors', () => {
    validationResult.mockReturnValue({ isEmpty: () => true, array: () => [] });

    const req  = {};
    const res  = makeRes();
    const next = jest.fn();

    handleValidationErrors(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('returns 400 with formatted errors when validation fails', () => {
    validationResult.mockReturnValue({
      isEmpty: () => false,
      array: () => [
        { path: 'state', msg: 'Invalid value', value: '<script>' }
      ]
    });

    const req  = {};
    const res  = makeRes();
    const next = jest.fn();

    handleValidationErrors(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: 'Validation failed',
      errors: [expect.objectContaining({ field: 'state', message: 'Invalid value' })]
    }));
  });

  test('formats multiple validation errors', () => {
    validationResult.mockReturnValue({
      isEmpty: () => false,
      array: () => [
        { path: 'id', msg: 'Must be integer', value: 'abc' },
        { path: 'state', msg: 'Invalid', value: '123' }
      ]
    });

    const req  = {};
    const res  = makeRes();
    const next = jest.fn();

    handleValidationErrors(req, res, next);

    const body = res.json.mock.calls[0][0];
    expect(body.errors).toHaveLength(2);
  });
});
