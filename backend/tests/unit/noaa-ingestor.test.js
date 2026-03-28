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

// ── New tests for ingestNOAAData, ingestObservations, getLastIngestionTime ──

const { ingestNOAAData, getLastIngestionTime } = require('../../src/ingestion/noaa-ingestor');
const { getNOAAAlerts, getLatestObservation } = require('../../src/ingestion/utils/api-client');
const {
  normalizeNOAAAlert,
  calculateHighestWeatherImpact,
  formatStatusReason
} = require('../../src/ingestion/utils/normalizer');
const OfficeModel = require('../../src/models/office');
const AdvisoryModel = require('../../src/models/advisory');
const OfficeStatusModel = require('../../src/models/officeStatus');
const AdvisoryHistory = require('../../src/models/advisoryHistory');
const ObservationModel = require('../../src/models/observation');
const IngestionEvent = require('../../src/models/ingestionEvent');
const { removeExpiredAdvisories } = require('../../src/utils/cleanup-advisories');
const { alertAnomaly } = require('../../src/utils/alerting');
const cache = require('../../src/utils/cache');
const { getDatabase } = require('../../src/config/database');

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a mock DB connection with transaction helpers */
function createMockConnection() {
  return {
    beginTransaction: jest.fn().mockResolvedValue(),
    query: jest.fn().mockResolvedValue([[], []]),
    commit: jest.fn().mockResolvedValue(),
    rollback: jest.fn().mockResolvedValue(),
    release: jest.fn()
  };
}

/** Build a mock database object */
function createMockDb(connection) {
  return {
    getConnection: jest.fn().mockResolvedValue(connection),
    query: jest.fn().mockResolvedValue([{ affectedRows: 0 }, []])
  };
}

/** Create a minimal NOAA alert fixture */
function makeAlert({ ugcCodes = ['FLZ076'], areaDesc = 'Monroe County, FL', affectedZones = ['zone1'], id = 'alert-1' } = {}) {
  return {
    properties: {
      id,
      affectedZones,
      geocode: { UGC: ugcCodes },
      areaDesc
    }
  };
}

/** Create an office fixture */
function makeOffice({ id = 1, state = 'FL', ugc_codes = '["FLZ076"]', county = 'monroe', office_code = 'MIA01', observation_station = null } = {}) {
  return { id, state, ugc_codes, county, office_code, name: `Office ${id}`, observation_station };
}

/** Wire up standard mocks for a successful ingestNOAAData run */
function setupHappyPath({ alerts = [makeAlert()], offices = [makeOffice()] } = {}) {
  const conn = createMockConnection();
  const db = createMockDb(conn);

  // Pre-fetch existing advisories query
  conn.query.mockResolvedValue([[], []]);

  getDatabase.mockReturnValue(db);
  getNOAAAlerts.mockResolvedValue(alerts);
  OfficeModel.getAll.mockResolvedValue(offices);
  IngestionEvent.recordStart.mockResolvedValue(42);
  IngestionEvent.recordSuccess.mockResolvedValue();
  AdvisoryModel.create.mockResolvedValue();
  AdvisoryModel.markExpired.mockResolvedValue(0);
  AdvisoryModel.getActive.mockResolvedValue([]);
  OfficeStatusModel.upsert.mockResolvedValue();
  AdvisoryHistory.createSnapshot.mockResolvedValue();
  ObservationModel.upsert.mockResolvedValue();
  removeExpiredAdvisories.mockResolvedValue(0);
  alertAnomaly.mockResolvedValue();

  normalizeNOAAAlert.mockImplementation((alert) => ({
    advisory_type: 'Tornado Warning',
    severity: 'Extreme',
    external_id: alert.properties.id || 'ext-1',
    issued_time: '2026-01-01T00:00:00Z'
  }));
  calculateHighestWeatherImpact.mockReturnValue('red');
  formatStatusReason.mockReturnValue('Tornado Warning (Extreme)');

  // db.query calls after transaction: endTimeExpired, activeCount, expire missing, anomaly check
  db.query
    .mockResolvedValueOnce([{ affectedRows: 0 }, []]) // end_time expired
    .mockResolvedValueOnce([[{ cnt: 5 }], []])         // active count
    .mockResolvedValueOnce([{ affectedRows: 1 }, []])  // expire missing
    .mockResolvedValueOnce([[], []]);                   // anomaly check

  return { conn, db };
}

// Suppress console output during tests
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  console.log.mockRestore();
  console.warn.mockRestore();
  console.error.mockRestore();
});

// ── ingestNOAAData ───────────────────────────────────────────────────────────

describe('ingestNOAAData()', () => {
  test('happy path: returns success with correct counts', async () => {
    setupHappyPath();

    const result = await ingestNOAAData();

    expect(result.status).toBe('success');
    expect(result.advisoriesCreated).toBe(1);
    expect(result.advisoriesFailed).toBe(0);
    expect(result.statusesUpdated).toBe(1);
    expect(result.statusesFailed).toBe(0);
  });

  test('records ingestion start event', async () => {
    setupHappyPath();

    await ingestNOAAData();

    expect(IngestionEvent.recordStart).toHaveBeenCalledTimes(1);
  });

  test('records ingestion success event with stats', async () => {
    setupHappyPath();

    await ingestNOAAData();

    expect(IngestionEvent.recordSuccess).toHaveBeenCalledWith(42, expect.objectContaining({
      advisoriesCreated: 1,
      advisoriesExpired: expect.any(Number),
      durationMs: expect.any(Number)
    }));
  });

  test('handles IngestionEvent.recordStart failure gracefully', async () => {
    setupHappyPath();
    IngestionEvent.recordStart.mockRejectedValue(new Error('table missing'));

    const result = await ingestNOAAData();

    // Should still complete successfully
    expect(result.status).toBe('success');
    // recordSuccess should not be called since ingestionEventId is null
    expect(IngestionEvent.recordSuccess).not.toHaveBeenCalled();
  });

  test('no alerts: marks all expired and returns early', async () => {
    const conn = createMockConnection();
    const db = createMockDb(conn);
    getDatabase.mockReturnValue(db);
    getNOAAAlerts.mockResolvedValue([]);
    IngestionEvent.recordStart.mockResolvedValue(null);
    AdvisoryModel.markExpired.mockResolvedValue(5);

    const result = await ingestNOAAData();

    expect(result).toBeUndefined(); // returns early with no value
    expect(AdvisoryModel.markExpired).toHaveBeenCalledTimes(1);
    // Should NOT attempt to get offices or begin a transaction
    expect(OfficeModel.getAll).not.toHaveBeenCalled();
  });

  test('transaction: begins, commits on success', async () => {
    const { conn } = setupHappyPath();

    await ingestNOAAData();

    expect(conn.beginTransaction).toHaveBeenCalledTimes(1);
    expect(conn.commit).toHaveBeenCalledTimes(1);
    expect(conn.rollback).not.toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalledTimes(1);
  });

  test('transaction: rollback on error, then re-throws', async () => {
    const conn = createMockConnection();
    const db = createMockDb(conn);
    getDatabase.mockReturnValue(db);
    getNOAAAlerts.mockResolvedValue([makeAlert()]);
    OfficeModel.getAll.mockResolvedValue([makeOffice()]);
    IngestionEvent.recordStart.mockResolvedValue(99);
    IngestionEvent.recordFailure.mockResolvedValue();

    normalizeNOAAAlert.mockReturnValue({
      advisory_type: 'Tornado Warning',
      severity: 'Extreme',
      external_id: 'ext-1'
    });

    conn.query.mockResolvedValue([[], []]);

    // Make commit fail — this triggers the catch block that does rollback + throw
    conn.commit.mockRejectedValue(new Error('commit failed'));

    await expect(ingestNOAAData()).rejects.toThrow('commit failed');

    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(conn.release).toHaveBeenCalledTimes(1);
  });

  test('records failure event on error', async () => {
    const conn = createMockConnection();
    const db = createMockDb(conn);
    getDatabase.mockReturnValue(db);
    getNOAAAlerts.mockRejectedValue(new Error('API down'));
    IngestionEvent.recordStart.mockResolvedValue(99);
    IngestionEvent.recordFailure.mockResolvedValue();

    await expect(ingestNOAAData()).rejects.toThrow('API down');

    expect(IngestionEvent.recordFailure).toHaveBeenCalledWith(
      99,
      'API down',
      expect.any(Number)
    );
  });

  test('finally block resets isIngesting and ingestionStartedAt', async () => {
    setupHappyPath();

    await ingestNOAAData();
    const status = getIngestionStatus();

    expect(status.active).toBe(false);
    expect(status.startedAt).toBeNull();
  });

  test('finally block resets state even on error', async () => {
    const conn = createMockConnection();
    const db = createMockDb(conn);
    getDatabase.mockReturnValue(db);
    getNOAAAlerts.mockRejectedValue(new Error('boom'));
    IngestionEvent.recordStart.mockResolvedValue(null);

    await expect(ingestNOAAData()).rejects.toThrow('boom');

    const status = getIngestionStatus();
    expect(status.active).toBe(false);
    expect(status.startedAt).toBeNull();
  });

  // UGC matching tests

  test('Level 1 matching: matches alert to office via UGC codes', async () => {
    const office = makeOffice({ id: 10, ugc_codes: '["FLZ076"]' });
    setupHappyPath({ offices: [office] });

    const result = await ingestNOAAData();

    expect(result.advisoriesCreated).toBe(1);
    expect(AdvisoryModel.create).toHaveBeenCalledTimes(1);
  });

  test('Level 2 matching: falls back to county when no UGC match', async () => {
    const office = makeOffice({ id: 20, ugc_codes: '["TXZ001"]', county: 'monroe', state: 'FL' });
    const alert = makeAlert({ ugcCodes: ['FLZ999'], areaDesc: 'Monroe County, FL' });

    setupHappyPath({ alerts: [alert], offices: [office] });

    // UGC won't match (office has TXZ001, alert has FLZ999), but county will
    const result = await ingestNOAAData();

    expect(result.advisoriesCreated).toBe(1);
  });

  test('Level 3 matching: falls back to state for offices without UGC codes', async () => {
    const office = makeOffice({ id: 30, ugc_codes: null, state: 'FL' });
    const alert = makeAlert({ ugcCodes: ['FLZ999'], areaDesc: 'Some Zone' });

    setupHappyPath({ alerts: [alert], offices: [office] });

    const result = await ingestNOAAData();

    // State fallback only applies to offices without ugc_codes
    expect(result.advisoriesCreated).toBe(1);
  });

  test('skips alerts with no affectedZones', async () => {
    const alert = makeAlert();
    alert.properties.affectedZones = [];

    setupHappyPath({ alerts: [alert] });

    const result = await ingestNOAAData();

    expect(result.advisoriesCreated).toBe(0);
    expect(AdvisoryModel.create).not.toHaveBeenCalled();
  });

  // Deduplication tests

  test('deduplication: keeps highest severity of same type per office', async () => {
    const office = makeOffice({ id: 1 });
    const alert1 = makeAlert({ id: 'alert-1' });
    const alert2 = makeAlert({ id: 'alert-2' });

    const conn = createMockConnection();
    const db = createMockDb(conn);
    conn.query.mockResolvedValue([[], []]);
    getDatabase.mockReturnValue(db);
    getNOAAAlerts.mockResolvedValue([alert1, alert2]);
    OfficeModel.getAll.mockResolvedValue([office]);
    IngestionEvent.recordStart.mockResolvedValue(42);
    IngestionEvent.recordSuccess.mockResolvedValue();
    AdvisoryModel.create.mockResolvedValue();
    AdvisoryModel.getActive.mockResolvedValue([]);
    OfficeStatusModel.upsert.mockResolvedValue();
    AdvisoryHistory.createSnapshot.mockResolvedValue();
    removeExpiredAdvisories.mockResolvedValue(0);
    alertAnomaly.mockResolvedValue();
    calculateHighestWeatherImpact.mockReturnValue('red');
    formatStatusReason.mockReturnValue('Tornado Warning (Extreme)');

    let callCount = 0;
    normalizeNOAAAlert.mockImplementation(() => {
      callCount++;
      return {
        advisory_type: 'Tornado Warning',
        severity: callCount === 1 ? 'Moderate' : 'Extreme',
        external_id: `ext-${callCount}`,
        issued_time: '2026-01-01T00:00:00Z'
      };
    });

    db.query
      .mockResolvedValueOnce([{ affectedRows: 0 }, []])
      .mockResolvedValueOnce([[{ cnt: 5 }], []])
      .mockResolvedValueOnce([{ affectedRows: 0 }, []])
      .mockResolvedValueOnce([[], []]);

    const result = await ingestNOAAData();

    // Two alerts of same type → deduplicated to 1 (higher severity)
    expect(result.advisoriesCreated).toBe(1);
  });

  test('deduplication: same severity keeps latest issued_time', async () => {
    const office = makeOffice({ id: 1 });
    const alert1 = makeAlert({ id: 'alert-1' });
    const alert2 = makeAlert({ id: 'alert-2' });

    const conn = createMockConnection();
    const db = createMockDb(conn);
    conn.query.mockResolvedValue([[], []]);
    getDatabase.mockReturnValue(db);
    getNOAAAlerts.mockResolvedValue([alert1, alert2]);
    OfficeModel.getAll.mockResolvedValue([office]);
    IngestionEvent.recordStart.mockResolvedValue(42);
    IngestionEvent.recordSuccess.mockResolvedValue();
    AdvisoryModel.create.mockResolvedValue();
    AdvisoryModel.getActive.mockResolvedValue([]);
    OfficeStatusModel.upsert.mockResolvedValue();
    AdvisoryHistory.createSnapshot.mockResolvedValue();
    removeExpiredAdvisories.mockResolvedValue(0);
    alertAnomaly.mockResolvedValue();
    calculateHighestWeatherImpact.mockReturnValue('red');
    formatStatusReason.mockReturnValue('Tornado Warning (Extreme)');

    let callCount = 0;
    normalizeNOAAAlert.mockImplementation(() => {
      callCount++;
      return {
        advisory_type: 'Tornado Warning',
        severity: 'Extreme',
        external_id: `ext-${callCount}`,
        issued_time: callCount === 1 ? '2026-01-01T00:00:00Z' : '2026-01-02T00:00:00Z'
      };
    });

    db.query
      .mockResolvedValueOnce([{ affectedRows: 0 }, []])
      .mockResolvedValueOnce([[{ cnt: 5 }], []])
      .mockResolvedValueOnce([{ affectedRows: 0 }, []])
      .mockResolvedValueOnce([[], []]);

    const result = await ingestNOAAData();

    // Same type + same severity → kept 1 (the later issued_time)
    expect(result.advisoriesCreated).toBe(1);
    // The created advisory should have ext-2 (later issued_time)
    const createdAdvisory = AdvisoryModel.create.mock.calls[0][0];
    expect(createdAdvisory.external_id).toBe('ext-2');
  });

  // Expired marking

  test('marks advisories with passed end_time as expired', async () => {
    const { db } = setupHappyPath();
    db.query
      .mockResolvedValueOnce([{ affectedRows: 3 }, []])  // end_time expired
      .mockResolvedValueOnce([[{ cnt: 5 }], []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])
      .mockResolvedValueOnce([[], []]);

    const result = await ingestNOAAData();

    expect(result.status).toBe('success');
    // First db.query call after transaction is the end_time expiry
    expect(db.query).toHaveBeenCalledTimes(4);
  });

  test('partial NOAA response safeguard: skips expiry when <10% of active', async () => {
    const conn = createMockConnection();
    const db = createMockDb(conn);
    conn.query.mockResolvedValue([[], []]);
    getDatabase.mockReturnValue(db);

    getNOAAAlerts.mockResolvedValue([makeAlert()]);
    OfficeModel.getAll.mockResolvedValue([makeOffice()]);
    IngestionEvent.recordStart.mockResolvedValue(42);
    IngestionEvent.recordSuccess.mockResolvedValue();
    AdvisoryModel.create.mockResolvedValue();
    AdvisoryModel.getActive.mockResolvedValue([]);
    OfficeStatusModel.upsert.mockResolvedValue();
    AdvisoryHistory.createSnapshot.mockResolvedValue();
    removeExpiredAdvisories.mockResolvedValue(0);
    alertAnomaly.mockResolvedValue();

    normalizeNOAAAlert.mockReturnValue({
      advisory_type: 'Tornado Warning',
      severity: 'Extreme',
      external_id: 'ext-1',
      issued_time: '2026-01-01T00:00:00Z'
    });
    calculateHighestWeatherImpact.mockReturnValue('red');
    formatStatusReason.mockReturnValue('reason');

    // 1 processed ID but 100 active → 1% → skip expiry
    db.query
      .mockResolvedValueOnce([{ affectedRows: 0 }, []])   // end_time expired
      .mockResolvedValueOnce([[{ cnt: 100 }], []])         // active count = 100
      .mockResolvedValueOnce([[], []]);                    // anomaly check (expiry skipped)

    const result = await ingestNOAAData();

    expect(result.status).toBe('success');
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('possible partial NOAA response')
    );
  });

  // Historical snapshots

  test('creates historical snapshots for matched offices', async () => {
    setupHappyPath();

    await ingestNOAAData();

    expect(AdvisoryHistory.createSnapshot).toHaveBeenCalledTimes(1);
    expect(AdvisoryHistory.createSnapshot).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        advisory_count: 1,
        highest_severity: 'Extreme',
        highest_severity_type: 'Tornado Warning'
      })
    );
  });

  test('snapshot failure does not fail ingestion', async () => {
    setupHappyPath();
    AdvisoryHistory.createSnapshot.mockRejectedValue(new Error('snapshot error'));

    const result = await ingestNOAAData();

    expect(result.status).toBe('success');
  });

  // Anomaly detection

  test('calls alertAnomaly when offices have >15 active advisories', async () => {
    const conn = createMockConnection();
    const db = createMockDb(conn);
    conn.query.mockResolvedValue([[], []]);
    getDatabase.mockReturnValue(db);

    getNOAAAlerts.mockResolvedValue([makeAlert()]);
    OfficeModel.getAll.mockResolvedValue([makeOffice()]);
    IngestionEvent.recordStart.mockResolvedValue(42);
    IngestionEvent.recordSuccess.mockResolvedValue();
    AdvisoryModel.create.mockResolvedValue();
    AdvisoryModel.getActive.mockResolvedValue([]);
    OfficeStatusModel.upsert.mockResolvedValue();
    AdvisoryHistory.createSnapshot.mockResolvedValue();
    removeExpiredAdvisories.mockResolvedValue(0);
    alertAnomaly.mockResolvedValue();

    normalizeNOAAAlert.mockReturnValue({
      advisory_type: 'Tornado Warning',
      severity: 'Extreme',
      external_id: 'ext-1',
      issued_time: '2026-01-01T00:00:00Z'
    });
    calculateHighestWeatherImpact.mockReturnValue('red');
    formatStatusReason.mockReturnValue('reason');

    const anomalyOffices = [{ office_code: 'MIA01', name: 'Miami', state: 'FL', advisory_count: 20 }];

    db.query
      .mockResolvedValueOnce([{ affectedRows: 0 }, []])   // end_time expired
      .mockResolvedValueOnce([[{ cnt: 5 }], []])           // active count
      .mockResolvedValueOnce([{ affectedRows: 0 }, []])    // expire missing
      .mockResolvedValueOnce([anomalyOffices, []]);        // anomaly check

    await ingestNOAAData();

    expect(alertAnomaly).toHaveBeenCalledWith(
      expect.stringContaining('1 office(s) have unusually high advisory counts'),
      expect.objectContaining({ offices: expect.any(Array) })
    );
  });

  test('no anomaly alert when all offices are normal', async () => {
    setupHappyPath();

    await ingestNOAAData();

    expect(alertAnomaly).not.toHaveBeenCalled();
  });

  // Cache

  test('invalidates dynamic cache and pre-warms active advisories', async () => {
    setupHappyPath();
    AdvisoryModel.getActive.mockResolvedValue([{ id: 1 }, { id: 2 }]);

    await ingestNOAAData();

    expect(cache.invalidateDynamic).toHaveBeenCalledTimes(1);
    expect(cache.set).toHaveBeenCalledWith(
      'advisories:active',
      expect.objectContaining({ success: true, count: 2 }),
      900
    );
  });

  test('cache pre-warm failure is non-fatal', async () => {
    setupHappyPath();
    AdvisoryModel.getActive.mockRejectedValue(new Error('cache fail'));

    const result = await ingestNOAAData();

    expect(result.status).toBe('success');
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('[CACHE] Pre-warm failed'),
      expect.any(String)
    );
  });

  // Offices with no advisories get green status

  test('sets green weather_impact_level for offices with no matching advisories', async () => {
    const officeWithAlert = makeOffice({ id: 1 });
    const officeWithoutAlert = makeOffice({ id: 2, ugc_codes: '["TXZ001"]', state: 'TX' });

    setupHappyPath({ offices: [officeWithAlert, officeWithoutAlert] });

    await ingestNOAAData();

    // officeWithoutAlert should get green
    expect(OfficeStatusModel.upsert).toHaveBeenCalledWith(2, expect.objectContaining({
      weather_impact_level: 'green',
      reason: 'No active advisories'
    }));
  });

  // Partial status

  test('returns partial status when some advisory writes fail', async () => {
    const office = makeOffice({ id: 1 });
    const alert1 = makeAlert({ id: 'a1', ugcCodes: ['FLZ076'] });
    const alert2 = makeAlert({ id: 'a2', ugcCodes: ['FLZ076'] });

    const conn = createMockConnection();
    const db = createMockDb(conn);
    conn.query.mockResolvedValue([[], []]);
    getDatabase.mockReturnValue(db);
    getNOAAAlerts.mockResolvedValue([alert1, alert2]);
    OfficeModel.getAll.mockResolvedValue([office]);
    IngestionEvent.recordStart.mockResolvedValue(42);
    IngestionEvent.recordSuccess.mockResolvedValue();
    OfficeStatusModel.upsert.mockResolvedValue();
    AdvisoryHistory.createSnapshot.mockResolvedValue();
    removeExpiredAdvisories.mockResolvedValue(0);
    alertAnomaly.mockResolvedValue();
    AdvisoryModel.getActive.mockResolvedValue([]);
    calculateHighestWeatherImpact.mockReturnValue('red');
    formatStatusReason.mockReturnValue('reason');

    let callIdx = 0;
    normalizeNOAAAlert.mockImplementation(() => {
      callIdx++;
      return {
        advisory_type: `Type${callIdx}`,
        severity: 'Severe',
        external_id: `ext-${callIdx}`,
        issued_time: '2026-01-01T00:00:00Z'
      };
    });

    // First advisory create succeeds, second fails
    AdvisoryModel.create
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(new Error('write fail'));

    db.query
      .mockResolvedValueOnce([{ affectedRows: 0 }, []])
      .mockResolvedValueOnce([[{ cnt: 5 }], []])
      .mockResolvedValueOnce([{ affectedRows: 0 }, []])
      .mockResolvedValueOnce([[], []]);

    const result = await ingestNOAAData();

    expect(result.status).toBe('partial');
    expect(result.advisoriesFailed).toBe(1);
    expect(result.advisoriesCreated).toBe(1);
  });

  test('handles UGC codes stored as array (not string) on office', async () => {
    const office = makeOffice({ id: 1, ugc_codes: ['FLZ076'] });
    setupHappyPath({ offices: [office] });

    const result = await ingestNOAAData();

    expect(result.advisoriesCreated).toBe(1);
  });

  test('handles invalid JSON in office ugc_codes gracefully', async () => {
    // Office has invalid ugc_codes JSON but valid county. The UGC parse
    // silently fails, so UGC-level matching won't find this office. However,
    // the alert's areaDesc "Monroe County, FL" triggers Level 2 county
    // matching which does match (office county is 'monroe', state is 'FL').
    const office = makeOffice({ id: 1, ugc_codes: '{bad json', state: 'FL', county: 'monroe' });
    setupHappyPath({ offices: [office] });

    const result = await ingestNOAAData();

    // Matches via county fallback despite broken ugc_codes
    expect(result.advisoriesCreated).toBe(1);
  });

  test('OfficeStatusModel.upsert failure increments statusesFailed', async () => {
    setupHappyPath();
    OfficeStatusModel.upsert.mockRejectedValue(new Error('status write fail'));

    const result = await ingestNOAAData();

    expect(result.status).toBe('partial');
    expect(result.statusesFailed).toBeGreaterThan(0);
  });

  test('pre-fetches existing advisories inside transaction', async () => {
    const { conn } = setupHappyPath();

    await ingestNOAAData();

    // First query on connection should be the SELECT for existing advisories
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT id, external_id, office_id'),
      expect.any(Array)
    );
  });

  test('inserts unknown alert_types before creating advisory', async () => {
    const { conn } = setupHappyPath();

    await ingestNOAAData();

    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT IGNORE INTO alert_types'),
      ['Tornado Warning', 'UNKNOWN']
    );
  });
});

// ── ingestObservations (called internally by ingestNOAAData) ─────────────────
// We test ingestObservations indirectly through ingestNOAAData since it's not exported.
// The observations step runs after the main advisory ingestion.

describe('ingestObservations() via ingestNOAAData()', () => {
  test('no mapped observation stations → early return with 0 counts', async () => {
    const office = makeOffice({ observation_station: null });
    setupHappyPath({ offices: [office] });

    const result = await ingestNOAAData();

    expect(result.observationsUpdated).toBe(0);
    expect(result.observationsTotal).toBe(0);
    expect(getLatestObservation).not.toHaveBeenCalled();
  });

  test('fetches observation and upserts for mapped office', async () => {
    const office = makeOffice({ id: 1, observation_station: 'KMIA' });
    setupHappyPath({ offices: [office] });

    getLatestObservation.mockResolvedValue({
      temperature: { value: 28.5 },
      relativeHumidity: { value: 65 },
      dewpoint: { value: 20 },
      windSpeed: { value: 15 },
      windDirection: { value: 180.7 },
      windGust: { value: null },
      barometricPressure: { value: 101300 },
      visibility: { value: 16000 },
      windChill: { value: null },
      heatIndex: { value: 32 },
      cloudLayers: [{ base: { value: 1500 } }],
      textDescription: 'Partly Cloudy',
      timestamp: new Date().toISOString()
    });

    const result = await ingestNOAAData();

    expect(result.observationsUpdated).toBe(1);
    expect(result.observationsTotal).toBe(1);
    expect(ObservationModel.upsert).toHaveBeenCalledWith(1, expect.objectContaining({
      station_id: 'KMIA',
      temperature_c: 28.5,
      wind_direction_deg: 181, // rounded
      text_description: 'Partly Cloudy',
      observed_at: expect.any(Date)
    }));
  });

  test('upsert includes temperature_c and observed_at for frontend display', async () => {
    const office = makeOffice({ id: 1, observation_station: 'KORD' });
    setupHappyPath({ offices: [office] });

    const observedTime = '2026-03-15T14:00:00Z';
    getLatestObservation.mockResolvedValue({
      temperature: { value: 12.3 },
      timestamp: observedTime
    });

    await ingestNOAAData();

    expect(ObservationModel.upsert).toHaveBeenCalledWith(1, expect.objectContaining({
      temperature_c: 12.3,
      observed_at: new Date(observedTime)
    }));
  });

  test('deduplicates station fetches when multiple offices share one station', async () => {
    const office1 = makeOffice({ id: 1, observation_station: 'KMIA', ugc_codes: '["FLZ076"]' });
    const office2 = makeOffice({ id: 2, observation_station: 'KMIA', ugc_codes: '["FLZ077"]', state: 'FL' });
    setupHappyPath({ offices: [office1, office2] });

    getLatestObservation.mockResolvedValue({
      temperature: { value: 25 },
      timestamp: new Date().toISOString()
    });

    await ingestNOAAData();

    // Station fetched only once
    expect(getLatestObservation).toHaveBeenCalledTimes(1);
    expect(getLatestObservation).toHaveBeenCalledWith('KMIA', { signal: undefined });
    // But upserted for both offices
    expect(ObservationModel.upsert).toHaveBeenCalledTimes(2);
  });

  test('handles null observation data from station', async () => {
    const office = makeOffice({ id: 1, observation_station: 'KMIA' });
    setupHappyPath({ offices: [office] });

    getLatestObservation.mockResolvedValue(null);

    const result = await ingestNOAAData();

    expect(result.observationsUpdated).toBe(0);
    expect(ObservationModel.upsert).not.toHaveBeenCalled();
  });

  test('warns on stale observation (>120 min old)', async () => {
    const office = makeOffice({ id: 1, observation_station: 'KMIA' });
    setupHappyPath({ offices: [office] });

    const staleTime = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(); // 3 hours ago
    getLatestObservation.mockResolvedValue({
      temperature: { value: 20 },
      timestamp: staleTime
    });

    await ingestNOAAData();

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('stale')
    );
    // Still upserts despite staleness
    expect(ObservationModel.upsert).toHaveBeenCalledTimes(1);
  });

  test('per-office upsert failure increments failed count', async () => {
    const office = makeOffice({ id: 1, observation_station: 'KMIA' });
    setupHappyPath({ offices: [office] });

    getLatestObservation.mockResolvedValue({
      temperature: { value: 20 },
      timestamp: new Date().toISOString()
    });
    ObservationModel.upsert.mockRejectedValue(new Error('upsert fail'));

    const result = await ingestNOAAData();

    // observation failed but ingestion still succeeds
    expect(result.status).toBe('success');
    expect(result.observationsUpdated).toBe(0);
  });

  test('station fetch failure increments failed count for all offices on that station', async () => {
    const office1 = makeOffice({ id: 1, observation_station: 'KBAD', ugc_codes: '["FLZ076"]' });
    const office2 = makeOffice({ id: 2, observation_station: 'KBAD', ugc_codes: '["FLZ077"]', state: 'FL' });
    setupHappyPath({ offices: [office1, office2] });

    getLatestObservation.mockRejectedValue(new Error('station down'));

    const result = await ingestNOAAData();

    // Both offices mapped to the failed station count as failed
    expect(result.observationsUpdated).toBe(0);
  });

  test('handles observation with all nullable fields as null', async () => {
    const office = makeOffice({ id: 1, observation_station: 'KMIA' });
    setupHappyPath({ offices: [office] });

    ObservationModel.upsert.mockResolvedValue();

    getLatestObservation.mockResolvedValue({
      temperature: null,
      relativeHumidity: null,
      dewpoint: null,
      windSpeed: null,
      windDirection: null,
      windGust: null,
      barometricPressure: null,
      visibility: null,
      windChill: null,
      heatIndex: null,
      cloudLayers: null,
      textDescription: null,
      timestamp: null
    });

    const result = await ingestNOAAData();

    expect(result.observationsUpdated).toBe(1);
    expect(ObservationModel.upsert).toHaveBeenCalledWith(1, expect.objectContaining({
      station_id: 'KMIA',
      temperature_c: null,
      observed_at: null
    }));
  });
});

// ── getLastIngestionTime ─────────────────────────────────────────────────────

describe('getLastIngestionTime()', () => {
  test('returns lastUpdated when IngestionEvent.getLastSuccessful returns data', async () => {
    IngestionEvent.getLastSuccessful.mockResolvedValue({
      lastUpdated: '2026-01-15T10:30:00.000Z',
      minutesAgo: 5
    });

    const result = await getLastIngestionTime();

    expect(result).toEqual({ lastUpdated: '2026-01-15T10:30:00.000Z' });
  });

  test('returns null when no successful ingestion exists', async () => {
    IngestionEvent.getLastSuccessful.mockResolvedValue(null);

    const result = await getLastIngestionTime();

    expect(result).toBeNull();
  });

  test('returns null when table does not exist (catch block)', async () => {
    IngestionEvent.getLastSuccessful.mockRejectedValue(new Error('Table not found'));

    const result = await getLastIngestionTime();

    expect(result).toBeNull();
  });
});
