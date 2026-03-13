'use strict';

/**
 * Unit tests for src/models/advisory.js
 * All database calls are mocked via jest.mock so no live DB is needed.
 */

// Mock the database module before requiring advisory model
jest.mock('../../src/config/database', () => ({
  getDatabase: jest.fn()
}));

const { getDatabase } = require('../../src/config/database');
const AdvisoryModel   = require('../../src/models/advisory');

// Build a mock db that returns configurable results
function makeDb(queryResults = []) {
  let callIndex = 0;
  return {
    query: jest.fn(async () => {
      const result = queryResults[callIndex] ?? [[],  {}];
      callIndex++;
      return result;
    })
  };
}

const BASE_ADVISORY = {
  office_id:     1,
  advisory_type: 'Tornado Warning',
  severity:      'Extreme',
  status:        'active',
  source:        'NOAA',
  headline:      'Tornado Warning',
  description:   'Tornado warning in effect',
  start_time:    '2026-03-10T12:00:00Z',
  end_time:      '2026-03-10T15:00:00Z',
  issued_time:   '2026-03-10T11:55:00Z',
  external_id:   'urn:oid:2.49.0.1.840.0.abc123',
  vtec_event_id: 'KIWX.TO.W.0001',
  vtec_action:   'NEW',
  vtec_code:     '/O.NEW.KIWX.TO.W.0001.260310T1200Z-260310T1500Z/',
  raw_payload:   null
};

afterEach(() => jest.clearAllMocks());

// ── create() deduplication paths ──────────────────────────────────────────────

describe('AdvisoryModel.create() — deduplication', () => {
  test('updates existing advisory when external_id matches', async () => {
    const existing = { id: 42, ...BASE_ADVISORY };
    // findByExternalID returns existing; update returns it; getById called by update
    const db = makeDb([
      [[existing], {}],        // findByExternalID SELECT
      [{}, {}],                // UPDATE
      [[existing], {}]         // getById after update
    ]);
    getDatabase.mockReturnValue(db);

    const updateSpy = jest.spyOn(AdvisoryModel, 'update').mockResolvedValue(existing);

    const result = await AdvisoryModel.create({ ...BASE_ADVISORY });

    expect(updateSpy).toHaveBeenCalledWith(42, expect.any(Object));
    expect(result).toEqual(existing);

    updateSpy.mockRestore();
  });

  test('updates existing advisory when VTEC event ID matches (no external_id)', async () => {
    const advisory = { ...BASE_ADVISORY, external_id: null };
    const existing = { id: 55, ...advisory };

    const db = makeDb([
      [[existing], {}],  // findByVTECEventID SELECT
      [{}, {}],          // UPDATE
      [[existing], {}]   // getById
    ]);
    getDatabase.mockReturnValue(db);

    const updateSpy = jest.spyOn(AdvisoryModel, 'update').mockResolvedValue(existing);

    const result = await AdvisoryModel.create(advisory);

    expect(updateSpy).toHaveBeenCalledWith(55, expect.any(Object));

    updateSpy.mockRestore();
  });

  test('uses natural-key dedup and updates when both external_id and VTEC are null (closes #114)', async () => {
    const advisory = { ...BASE_ADVISORY, external_id: null, vtec_event_id: null, vtec_code: null };
    const existing = { id: 77, ...advisory };

    const db = makeDb([
      [[existing], {}],  // findByNaturalKey SELECT
      [{}, {}],          // UPDATE
      [[existing], {}]   // getById
    ]);
    getDatabase.mockReturnValue(db);

    const updateSpy = jest.spyOn(AdvisoryModel, 'update').mockResolvedValue(existing);

    const result = await AdvisoryModel.create(advisory);

    expect(updateSpy).toHaveBeenCalledWith(77, expect.any(Object));

    updateSpy.mockRestore();
  });

  test('inserts new advisory when no duplicate found', async () => {
    const advisory = { ...BASE_ADVISORY };
    const newRow   = { id: 99, ...advisory };

    const db = makeDb([
      [[], {}],                      // findByExternalID → not found
      [[], {}],                      // findByVTECEventID → not found
      [{ insertId: 99 }, {}],        // INSERT
      [[newRow], {}]                 // getById
    ]);
    getDatabase.mockReturnValue(db);

    const result = await AdvisoryModel.create(advisory);

    expect(result).toEqual(newRow);
  });
});

// ── findByNaturalKey ──────────────────────────────────────────────────────────

describe('AdvisoryModel.findByNaturalKey()', () => {
  test('returns matching row when one exists', async () => {
    const row = { id: 10, office_id: 1, advisory_type: 'Flood Warning', source: 'NOAA', start_time: '2026-03-10T12:00:00Z' };
    const db  = makeDb([[[row], {}]]);
    getDatabase.mockReturnValue(db);

    const result = await AdvisoryModel.findByNaturalKey(1, 'Flood Warning', 'NOAA', '2026-03-10T12:00:00Z');

    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('start_time = ?'),
      [1, 'Flood Warning', 'NOAA', '2026-03-10T12:00:00Z']
    );
  });

  test('uses IS NULL clause when start_time is null', async () => {
    const db = makeDb([[[], {}]]);
    getDatabase.mockReturnValue(db);

    await AdvisoryModel.findByNaturalKey(1, 'Flood Warning', 'NOAA', null);

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('start_time IS NULL'),
      [1, 'Flood Warning', 'NOAA']
    );
  });

  test('returns null when no match found', async () => {
    const db = makeDb([[[], {}]]);
    getDatabase.mockReturnValue(db);

    const result = await AdvisoryModel.findByNaturalKey(1, 'Flood Warning', 'NOAA', null);

    expect(result).toBeNull();
  });
});
