'use strict';

/**
 * Unit tests for pure/exported functions in src/ingestion/noaa-ingestor.js
 * Only tests functions that don't require database or network calls.
 */

// Mock all heavy dependencies so require() doesn't fail
jest.mock('../../src/ingestion/utils/api-client', () => ({
  getNOAAAlerts: jest.fn(),
  getLatestObservation: jest.fn()
}));
jest.mock('../../src/ingestion/utils/normalizer', () => ({
  normalizeNOAAAlert: jest.fn(),
  calculateWeatherImpact: jest.fn(),
  calculateHighestWeatherImpact: jest.fn(),
  formatStatusReason: jest.fn()
}));
jest.mock('../../src/models/office');
jest.mock('../../src/models/advisory');
jest.mock('../../src/models/officeStatus');
jest.mock('../../src/models/advisoryHistory');
jest.mock('../../src/models/observation');
jest.mock('../../src/models/ingestionEvent');
jest.mock('../../src/utils/cleanup-advisories', () => ({
  removeExpiredAdvisories: jest.fn()
}));
jest.mock('../../src/utils/alerting', () => ({
  alertAnomaly: jest.fn()
}));
jest.mock('../../src/utils/cache', () => ({
  invalidateDynamic: jest.fn(),
  set: jest.fn(),
  CACHE_KEYS: { ACTIVE_ADVISORIES: 'advisories:active' },
  TTL: { SHORT: 900 }
}));
jest.mock('../../src/config/database', () => ({
  getDatabase: jest.fn()
}));

const { getIngestionStatus, _testing } = require('../../src/ingestion/noaa-ingestor');
const { extractGeoFromAlert, stateNameToCode } = _testing;

afterEach(() => jest.clearAllMocks());

// ── getIngestionStatus ─────────────────────────────────────────────────────

describe('getIngestionStatus()', () => {
  test('returns active=false when not ingesting', () => {
    const status = getIngestionStatus();
    expect(status.active).toBe(false);
    expect(status.startedAt).toBeNull();
  });
});

// ── extractGeoFromAlert ────────────────────────────────────────────────────

describe('extractGeoFromAlert()', () => {
  test('extracts UGC codes from geocode.UGC', () => {
    const properties = {
      geocode: { UGC: ['FLZ076', 'FLZ077', 'FLC087'] },
      affectedZones: ['zone1']
    };

    const result = extractGeoFromAlert(properties);

    expect(result.ugcCodes).toEqual(expect.arrayContaining(['FLZ076', 'FLZ077', 'FLC087']));
    expect(result.states).toContain('FL');
  });

  test('extracts county and state from areaDesc', () => {
    const properties = {
      areaDesc: 'Monroe County, FL; Miami-Dade County, FL',
      affectedZones: ['zone1']
    };

    const result = extractGeoFromAlert(properties);

    expect(result.counties).toContain('FL|monroe');
    expect(result.counties).toContain('FL|miami-dade');
    expect(result.states).toContain('FL');
  });

  test('extracts state from full state name in areaDesc', () => {
    const properties = {
      areaDesc: 'California',
      affectedZones: ['zone1']
    };

    const result = extractGeoFromAlert(properties);

    expect(result.states).toContain('CA');
  });

  test('returns empty arrays when no geo data present', () => {
    const result = extractGeoFromAlert({});

    expect(result.ugcCodes).toEqual([]);
    expect(result.counties).toEqual([]);
    expect(result.states).toEqual([]);
  });

  test('handles geocode.SAME without error', () => {
    const properties = {
      geocode: { SAME: ['012345'] },
      affectedZones: ['zone1']
    };

    const result = extractGeoFromAlert(properties);

    // SAME codes are not currently mapped to states
    expect(result.ugcCodes).toEqual([]);
  });

  test('deduplicates UGC codes', () => {
    const properties = {
      geocode: { UGC: ['MNZ060', 'MNZ060', 'MNZ061'] },
      affectedZones: ['zone1']
    };

    const result = extractGeoFromAlert(properties);

    expect(result.ugcCodes).toHaveLength(2);
  });

  test('parses areaDesc with county name but no state code', () => {
    const properties = {
      areaDesc: 'Some Area Name',
      affectedZones: ['zone1']
    };

    const result = extractGeoFromAlert(properties);

    // "Some Area Name" isn't a county or state name match
    expect(result.counties).toEqual([]);
  });
});

// ── stateNameToCode ────────────────────────────────────────────────────────

describe('stateNameToCode()', () => {
  test('converts known state names', () => {
    expect(stateNameToCode('Florida')).toBe('FL');
    expect(stateNameToCode('California')).toBe('CA');
    expect(stateNameToCode('New York')).toBe('NY');
    expect(stateNameToCode('North Carolina')).toBe('NC');
  });

  test('is case-insensitive', () => {
    expect(stateNameToCode('FLORIDA')).toBe('FL');
    expect(stateNameToCode('california')).toBe('CA');
  });

  test('matches partial names (contains check)', () => {
    expect(stateNameToCode('Southern Florida region')).toBe('FL');
  });

  test('returns null for unknown names', () => {
    expect(stateNameToCode('Atlantis')).toBeNull();
    expect(stateNameToCode('')).toBeNull();
  });
});
