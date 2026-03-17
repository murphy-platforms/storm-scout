'use strict';

/**
 * Integration tests for /api/filters routes
 * Mocks noaa-alert-types to test both success and error (catch) branches.
 */

const mockGetAllFilters = jest.fn();
const mockGetFilterConfig = jest.fn();
const mockGetAlertTypesByLevel = jest.fn();
const mockGetImpactLevel = jest.fn();

jest.mock('../../src/config/noaa-alert-types', () => ({
  getAllFilters: mockGetAllFilters,
  getFilterConfig: mockGetFilterConfig,
  getAlertTypesByLevel: mockGetAlertTypesByLevel,
  getImpactLevel: mockGetImpactLevel,
  NOAA_ALERT_TYPES: {
    CRITICAL: ['Tornado Warning'],
    HIGH: ['Flood Warning'],
    MODERATE: ['Wind Advisory'],
    LOW: ['Frost Advisory'],
    INFO: ['Special Weather Statement']
  }
}));

const express = require('express');
const request = require('supertest');
const filtersRouter = require('../../src/routes/filters');

const app = express();
app.use('/api/filters', filtersRouter);

beforeEach(() => jest.spyOn(console, 'error').mockImplementation());
afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

// ── GET /api/filters ────────────────────────────────────────────────────

describe('GET /api/filters', () => {
  test('returns 200 with filter presets', async () => {
    const mockFilters = {
      OPERATIONS: { name: 'Operations View' },
      EXECUTIVE: { name: 'Executive Summary' }
    };
    mockGetAllFilters.mockReturnValue(mockFilters);

    const res = await request(app).get('/api/filters');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(mockFilters);
  });

  test('returns 500 when getAllFilters throws', async () => {
    mockGetAllFilters.mockImplementation(() => {
      throw new Error('getAllFilters boom');
    });

    const res = await request(app).get('/api/filters');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('getAllFilters boom');
  });
});

// ── GET /api/filters/types/all ──────────────────────────────────────────

describe('GET /api/filters/types/all', () => {
  test('returns 200 with all alert types', async () => {
    const res = await request(app).get('/api/filters/types/all');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('CRITICAL');
    expect(res.body.data.CRITICAL).toContain('Tornado Warning');
  });

  test('returns 500 when NOAA_ALERT_TYPES serialization throws', async () => {
    // The router destructured NOAA_ALERT_TYPES at require time, so it holds
    // a reference to the mock object. Adding toJSON that throws will cause
    // res.json() to fail during serialization, triggering the catch block.
    const mockModule = require('../../src/config/noaa-alert-types');
    const alertTypes = mockModule.NOAA_ALERT_TYPES;
    alertTypes.toJSON = () => { throw new Error('NOAA_ALERT_TYPES boom'); };

    const res = await request(app).get('/api/filters/types/all');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('NOAA_ALERT_TYPES boom');

    // Restore
    delete alertTypes.toJSON;
  });
});

// ── GET /api/filters/types/:level ───────────────────────────────────────

describe('GET /api/filters/types/:level', () => {
  test('returns alert types for a level', async () => {
    mockGetAlertTypesByLevel.mockReturnValue(['Tornado Warning', 'Flash Flood Warning']);

    const res = await request(app).get('/api/filters/types/critical');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(['Tornado Warning', 'Flash Flood Warning']);
    expect(res.body.count).toBe(2);
    expect(mockGetAlertTypesByLevel).toHaveBeenCalledWith('CRITICAL');
  });

  test('returns 500 when getAlertTypesByLevel throws', async () => {
    mockGetAlertTypesByLevel.mockImplementation(() => {
      throw new Error('getAlertTypesByLevel boom');
    });

    const res = await request(app).get('/api/filters/types/critical');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('getAlertTypesByLevel boom');
  });
});

// ── GET /api/filters/:filterName ────────────────────────────────────────

describe('GET /api/filters/:filterName', () => {
  test('returns 200 with filter config', async () => {
    const mockConfig = { name: 'Operations View', includeCategories: ['CRITICAL', 'HIGH'] };
    mockGetFilterConfig.mockReturnValue(mockConfig);

    const res = await request(app).get('/api/filters/operations');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(mockConfig);
    expect(mockGetFilterConfig).toHaveBeenCalledWith('OPERATIONS');
  });

  test('returns 404 when filter not found', async () => {
    mockGetFilterConfig.mockReturnValue(null);

    const res = await request(app).get('/api/filters/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Filter not found');
  });

  test('returns 500 when getFilterConfig throws', async () => {
    mockGetFilterConfig.mockImplementation(() => {
      throw new Error('getFilterConfig boom');
    });

    const res = await request(app).get('/api/filters/operations');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('getFilterConfig boom');
  });
});
