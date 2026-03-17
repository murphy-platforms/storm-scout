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

  test('VTEC dedup handled atomically by INSERT ON DUPLICATE KEY UPDATE (no explicit SELECT)', async () => {
    // When external_id is null but vtec_event_id is present, the explicit VTEC
    // SELECT-then-UPDATE path is no longer used. Instead, the INSERT ON DUPLICATE
    // KEY UPDATE fires on the vtec_event_unique_key constraint. (closes #265)
    const advisory = { ...BASE_ADVISORY, external_id: null };
    const newRow = { id: 55, ...advisory };

    const db = makeDb([
      [{ insertId: 55 }, {}],  // INSERT ON DUPLICATE KEY UPDATE (upsert)
      [[newRow], {}]           // getById
    ]);
    getDatabase.mockReturnValue(db);

    const result = await AdvisoryModel.create(advisory);

    expect(result).toEqual(newRow);
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
      [{ insertId: 99 }, {}],        // INSERT ON DUPLICATE KEY UPDATE
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

  test('returns null on DB error', async () => {
    const db = { query: jest.fn().mockRejectedValue(new Error('DB error')) };
    getDatabase.mockReturnValue(db);

    const result = await AdvisoryModel.findByNaturalKey(1, 'Flood Warning', 'NOAA', null);

    expect(result).toBeNull();
  });
});

// ── getAll ─────────────────────────────────────────────────────────────────────

describe('AdvisoryModel.getAll()', () => {
  test('returns all advisories without filters', async () => {
    const rows = [{ id: 1 }, { id: 2 }];
    const db = makeDb([[rows, {}]]);
    getDatabase.mockReturnValue(db);

    const result = await AdvisoryModel.getAll();

    expect(result).toEqual(rows);
  });

  test('filters by status', async () => {
    const db = makeDb([[[], {}]]);
    getDatabase.mockReturnValue(db);

    await AdvisoryModel.getAll({ status: 'active' });

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('a.status = ?'),
      ['active']
    );
  });

  test('filters by severity (comma-separated string)', async () => {
    const db = makeDb([[[], {}]]);
    getDatabase.mockReturnValue(db);

    await AdvisoryModel.getAll({ severity: 'Extreme,Severe' });

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('a.severity IN'),
      ['Extreme', 'Severe']
    );
  });

  test('filters by severity (array)', async () => {
    const db = makeDb([[[], {}]]);
    getDatabase.mockReturnValue(db);

    await AdvisoryModel.getAll({ severity: ['Extreme'] });

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('a.severity IN'),
      ['Extreme']
    );
  });

  test('filters by advisory_type', async () => {
    const db = makeDb([[[], {}]]);
    getDatabase.mockReturnValue(db);

    await AdvisoryModel.getAll({ advisory_type: 'Tornado Warning' });

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('a.advisory_type IN'),
      ['Tornado Warning']
    );
  });

  test('filters by state', async () => {
    const db = makeDb([[[], {}]]);
    getDatabase.mockReturnValue(db);

    await AdvisoryModel.getAll({ state: 'IN' });

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('s.state = ?'),
      ['IN']
    );
  });

  test('filters by office_id', async () => {
    const db = makeDb([[[], {}]]);
    getDatabase.mockReturnValue(db);

    await AdvisoryModel.getAll({ office_id: 42 });

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('a.office_id = ?'),
      [42]
    );
  });

  test('returns empty array on error', async () => {
    const db = { query: jest.fn().mockRejectedValue(new Error('DB error')) };
    getDatabase.mockReturnValue(db);

    const result = await AdvisoryModel.getAll();

    expect(result).toEqual([]);
  });
});

// ── getActive ──────────────────────────────────────────────────────────────────

describe('AdvisoryModel.getActive()', () => {
  test('delegates to getAll with status=active', async () => {
    const db = makeDb([[[], {}]]);
    getDatabase.mockReturnValue(db);

    await AdvisoryModel.getActive({ severity: 'Extreme' });

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('a.status = ?'),
      expect.arrayContaining(['active'])
    );
  });
});

// ── getById ────────────────────────────────────────────────────────────────────

describe('AdvisoryModel.getById()', () => {
  test('returns advisory when found', async () => {
    const row = { id: 1, advisory_type: 'Tornado Warning' };
    const db = makeDb([[[row], {}]]);
    getDatabase.mockReturnValue(db);

    expect(await AdvisoryModel.getById(1)).toEqual(row);
  });

  test('returns null when not found', async () => {
    const db = makeDb([[[], {}]]);
    getDatabase.mockReturnValue(db);

    expect(await AdvisoryModel.getById(999)).toBeNull();
  });

  test('returns null on error', async () => {
    const db = { query: jest.fn().mockRejectedValue(new Error('fail')) };
    getDatabase.mockReturnValue(db);

    expect(await AdvisoryModel.getById(1)).toBeNull();
  });
});

// ── getByOffice ────────────────────────────────────────────────────────────────

describe('AdvisoryModel.getByOffice()', () => {
  test('returns all advisories for office', async () => {
    const rows = [{ id: 1 }];
    const db = makeDb([[rows, {}]]);
    getDatabase.mockReturnValue(db);

    const result = await AdvisoryModel.getByOffice(1);

    expect(result).toEqual(rows);
  });

  test('filters by active when activeOnly=true', async () => {
    const db = makeDb([[[], {}]]);
    getDatabase.mockReturnValue(db);

    await AdvisoryModel.getByOffice(1, true);

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('status = ?'),
      [1, 'active']
    );
  });

  test('returns empty array on error', async () => {
    const db = { query: jest.fn().mockRejectedValue(new Error('fail')) };
    getDatabase.mockReturnValue(db);

    expect(await AdvisoryModel.getByOffice(1)).toEqual([]);
  });
});

// ── findByExternalID ───────────────────────────────────────────────────────────

describe('AdvisoryModel.findByExternalID()', () => {
  test('returns null for null externalId', async () => {
    expect(await AdvisoryModel.findByExternalID(null)).toBeNull();
  });

  test('queries with officeId when provided', async () => {
    const row = { id: 1, external_id: 'urn:123' };
    const db = makeDb([[[row], {}]]);
    getDatabase.mockReturnValue(db);

    const result = await AdvisoryModel.findByExternalID('urn:123', 5);

    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('external_id = ? AND office_id = ?'),
      ['urn:123', 5]
    );
  });

  test('queries without officeId for legacy callers', async () => {
    const db = makeDb([[[], {}]]);
    getDatabase.mockReturnValue(db);

    await AdvisoryModel.findByExternalID('urn:123');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('external_id = ?'),
      ['urn:123']
    );
  });

  test('returns null on error', async () => {
    const db = { query: jest.fn().mockRejectedValue(new Error('fail')) };
    getDatabase.mockReturnValue(db);

    expect(await AdvisoryModel.findByExternalID('urn:123', 1)).toBeNull();
  });
});

// ── findByVTECEventID ──────────────────────────────────────────────────────────

describe('AdvisoryModel.findByVTECEventID()', () => {
  test('returns null for null vtecEventId', async () => {
    expect(await AdvisoryModel.findByVTECEventID(null)).toBeNull();
  });

  test('queries with advisory type when provided', async () => {
    const row = { id: 1, vtec_event_id: 'KIWX.TO.W.0001' };
    const db = makeDb([[[row], {}]]);
    getDatabase.mockReturnValue(db);

    await AdvisoryModel.findByVTECEventID('KIWX.TO.W.0001', 1, 'Tornado Warning');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('advisory_type = ?'),
      expect.arrayContaining(['KIWX.TO.W.0001', 1, 'active', 'Tornado Warning'])
    );
  });

  test('returns null on error', async () => {
    const db = { query: jest.fn().mockRejectedValue(new Error('fail')) };
    getDatabase.mockReturnValue(db);

    expect(await AdvisoryModel.findByVTECEventID('KIWX.TO.W.0001', 1)).toBeNull();
  });
});

// ── findByExternalID (no officeId — fallback error path) ──────────────────────

describe('AdvisoryModel.findByExternalID() — fallback error path', () => {
  test('returns null on DB error for legacy callers (no officeId)', async () => {
    const db = { query: jest.fn().mockRejectedValue(new Error('DB error')) };
    getDatabase.mockReturnValue(db);

    expect(await AdvisoryModel.findByExternalID('urn:123')).toBeNull();
  });
});

// ── findByVTEC (legacy) ────────────────────────────────────────────────────────

describe('AdvisoryModel.findByVTEC()', () => {
  test('returns null for null vtecCode', async () => {
    expect(await AdvisoryModel.findByVTEC(null)).toBeNull();
  });

  test('queries with advisory type when provided', async () => {
    const db = makeDb([[[], {}]]);
    getDatabase.mockReturnValue(db);

    await AdvisoryModel.findByVTEC('/O.NEW.KIWX.TO.W.0001/', 1, 'Tornado Warning');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('advisory_type = ?'),
      ['/O.NEW.KIWX.TO.W.0001/', 1, 'Tornado Warning']
    );
  });

  test('returns null on DB error', async () => {
    const db = { query: jest.fn().mockRejectedValue(new Error('DB error')) };
    getDatabase.mockReturnValue(db);

    expect(await AdvisoryModel.findByVTEC('/O.NEW.KIWX.TO.W.0001/', 1)).toBeNull();
  });
});

// ── update ─────────────────────────────────────────────────────────────────────

describe('AdvisoryModel.update()', () => {
  test('updates fields and returns updated advisory', async () => {
    const updated = { id: 1, severity: 'Extreme' };
    const db = makeDb([
      [{}, {}],            // UPDATE
      [[[updated]], {}]    // getById
    ]);
    getDatabase.mockReturnValue(db);

    const getByIdSpy = jest.spyOn(AdvisoryModel, 'getById').mockResolvedValue(updated);
    const result = await AdvisoryModel.update(1, { severity: 'Extreme', headline: 'Updated' });

    expect(result).toEqual(updated);
    getByIdSpy.mockRestore();
  });

  test('returns current advisory when no fields to update', async () => {
    const existing = { id: 1 };
    const getByIdSpy = jest.spyOn(AdvisoryModel, 'getById').mockResolvedValue(existing);

    const result = await AdvisoryModel.update(1, { id: 1, office_id: 5 });

    expect(result).toEqual(existing);
    getByIdSpy.mockRestore();
  });

  test('serializes raw_payload objects to JSON', async () => {
    const db = makeDb([{}, {}]);
    getDatabase.mockReturnValue(db);
    jest.spyOn(AdvisoryModel, 'getById').mockResolvedValue({ id: 1 });

    await AdvisoryModel.update(1, { raw_payload: { test: true } });

    const params = db.query.mock.calls[0][1];
    expect(params[0]).toBe('{"test":true}');
    AdvisoryModel.getById.mockRestore();
  });

  test('returns null on error', async () => {
    const db = { query: jest.fn().mockRejectedValue(new Error('fail')) };
    getDatabase.mockReturnValue(db);

    expect(await AdvisoryModel.update(1, { severity: 'Minor' })).toBeNull();
  });
});

// ── delete ─────────────────────────────────────────────────────────────────────

describe('AdvisoryModel.delete()', () => {
  test('returns true when row deleted', async () => {
    const db = makeDb([[{ affectedRows: 1 }, {}]]);
    getDatabase.mockReturnValue(db);

    expect(await AdvisoryModel.delete(1)).toBe(true);
  });

  test('returns false when row not found', async () => {
    const db = makeDb([[{ affectedRows: 0 }, {}]]);
    getDatabase.mockReturnValue(db);

    expect(await AdvisoryModel.delete(999)).toBe(false);
  });

  test('returns false on error', async () => {
    const db = { query: jest.fn().mockRejectedValue(new Error('fail')) };
    getDatabase.mockReturnValue(db);

    expect(await AdvisoryModel.delete(1)).toBe(false);
  });
});

// ── create() — raw_payload extraction branches ────────────────────────────────

describe('AdvisoryModel.create() — raw_payload extraction', () => {
  test('extracts externalId from raw_payload object (not string)', async () => {
    const advisory = { ...BASE_ADVISORY, external_id: null, raw_payload: { id: 'urn:from-object', properties: {} } };
    const newRow = { id: 88, external_id: 'urn:from-object' };
    const db = {
      query: jest.fn()
        .mockResolvedValueOnce([[], {}])              // findByExternalID → not found
        .mockResolvedValueOnce([{ insertId: 88 }, {}]) // INSERT
        .mockResolvedValueOnce([[newRow], {}])          // getById
    };
    getDatabase.mockReturnValue(db);

    const result = await AdvisoryModel.create(advisory);

    expect(result).toEqual(newRow);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('external_id = ? AND office_id = ?'),
      ['urn:from-object', advisory.office_id]
    );
  });

  test('extracts externalId from raw_payload.properties.id when top-level id absent', async () => {
    const advisory = { ...BASE_ADVISORY, external_id: null, raw_payload: { properties: { id: 'urn:from-properties' } } };
    const newRow = { id: 89, external_id: 'urn:from-properties' };
    const db = {
      query: jest.fn()
        .mockResolvedValueOnce([[], {}])
        .mockResolvedValueOnce([{ insertId: 89 }, {}])
        .mockResolvedValueOnce([[newRow], {}])
    };
    getDatabase.mockReturnValue(db);

    const result = await AdvisoryModel.create(advisory);

    expect(result).toEqual(newRow);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('external_id = ? AND office_id = ?'),
      ['urn:from-properties', advisory.office_id]
    );
  });

  test('parses raw_payload string to extract externalId', async () => {
    const rawPayload = JSON.stringify({ id: 'urn:from-string' });
    const advisory = { ...BASE_ADVISORY, external_id: null, raw_payload: rawPayload };
    const newRow = { id: 90, external_id: 'urn:from-string' };
    const db = {
      query: jest.fn()
        .mockResolvedValueOnce([[], {}])
        .mockResolvedValueOnce([{ insertId: 90 }, {}])
        .mockResolvedValueOnce([[newRow], {}])
    };
    getDatabase.mockReturnValue(db);

    const result = await AdvisoryModel.create(advisory);

    expect(result).toEqual(newRow);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('external_id = ? AND office_id = ?'),
      ['urn:from-string', advisory.office_id]
    );
  });

  test('throws on DB error during INSERT', async () => {
    const db = {
      query: jest.fn()
        .mockResolvedValueOnce([[], {}])                        // findByExternalID → not found
        .mockRejectedValueOnce(new Error('insert error'))       // INSERT fails
    };
    getDatabase.mockReturnValue(db);

    await expect(AdvisoryModel.create({ ...BASE_ADVISORY })).rejects.toThrow('insert error');
  });
});

// ── getCountBySeverity ─────────────────────────────────────────────────────────

describe('AdvisoryModel.getCountBySeverity()', () => {
  test('returns counts for active advisories by default', async () => {
    const rows = [{ severity: 'Extreme', count: 3 }];
    const db = makeDb([[rows, {}]]);
    getDatabase.mockReturnValue(db);

    const result = await AdvisoryModel.getCountBySeverity();

    expect(result).toEqual(rows);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("status = 'active'"));
  });

  test('counts all when activeOnly=false', async () => {
    const db = makeDb([[[], {}]]);
    getDatabase.mockReturnValue(db);

    await AdvisoryModel.getCountBySeverity(false);

    const sql = db.query.mock.calls[0][0];
    expect(sql).not.toContain('WHERE');
  });

  test('returns empty array on DB error', async () => {
    const db = { query: jest.fn().mockRejectedValue(new Error('DB error')) };
    getDatabase.mockReturnValue(db);

    expect(await AdvisoryModel.getCountBySeverity()).toEqual([]);
  });
});

// ── getRecentlyUpdated ─────────────────────────────────────────────────────────

describe('AdvisoryModel.getRecentlyUpdated()', () => {
  test('returns rows with default limit', async () => {
    const db = makeDb([[[], {}]]);
    getDatabase.mockReturnValue(db);

    await AdvisoryModel.getRecentlyUpdated();

    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('LIMIT ?'), [10]);
  });

  test('uses custom limit', async () => {
    const db = makeDb([[[], {}]]);
    getDatabase.mockReturnValue(db);

    await AdvisoryModel.getRecentlyUpdated(5);

    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('LIMIT ?'), [5]);
  });

  test('returns empty array on DB error', async () => {
    const db = { query: jest.fn().mockRejectedValue(new Error('DB error')) };
    getDatabase.mockReturnValue(db);

    expect(await AdvisoryModel.getRecentlyUpdated()).toEqual([]);
  });
});

// ── markExpired ────────────────────────────────────────────────────────────────

describe('AdvisoryModel.markExpired()', () => {
  test('returns count of expired advisories', async () => {
    const db = makeDb([[{ affectedRows: 12 }, {}]]);
    getDatabase.mockReturnValue(db);

    expect(await AdvisoryModel.markExpired()).toBe(12);
  });

  test('returns 0 on error', async () => {
    const db = { query: jest.fn().mockRejectedValue(new Error('fail')) };
    getDatabase.mockReturnValue(db);

    expect(await AdvisoryModel.markExpired()).toBe(0);
  });
});

// ── findByExternalID legacy fallback error ──────────────────────────────────

describe('AdvisoryModel.findByExternalID() — legacy fallback error', () => {
  test('returns null when legacy (no officeId) query fails', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation();
    const db = { query: jest.fn().mockRejectedValue(new Error('DB fail')) };
    getDatabase.mockReturnValue(db);

    const result = await AdvisoryModel.findByExternalID('urn:123');

    expect(result).toBeNull();
    spy.mockRestore();
  });
});

// ── findByNaturalKey error ──────────────────────────────────────────────────

describe('AdvisoryModel.findByNaturalKey() — error path', () => {
  test('returns null on DB error', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation();
    const db = { query: jest.fn().mockRejectedValue(new Error('DB fail')) };
    getDatabase.mockReturnValue(db);

    const result = await AdvisoryModel.findByNaturalKey(1, 'Flood Warning', 'NOAA', '2026-01-01');

    expect(result).toBeNull();
    spy.mockRestore();
  });
});

// ── findByVTEC error ────────────────────────────────────────────────────────

describe('AdvisoryModel.findByVTEC() — error path', () => {
  test('returns null on DB error', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation();
    const db = { query: jest.fn().mockRejectedValue(new Error('DB fail')) };
    getDatabase.mockReturnValue(db);

    const result = await AdvisoryModel.findByVTEC('/O.NEW.KIWX.TO.W.0001/', 1);

    expect(result).toBeNull();
    spy.mockRestore();
  });
});

// ── create error ────────────────────────────────────────────────────────────

describe('AdvisoryModel.create() — error path', () => {
  test('throws on DB error during create', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation();
    const db = { query: jest.fn().mockRejectedValue(new Error('DB fail')) };
    getDatabase.mockReturnValue(db);

    await expect(AdvisoryModel.create({ ...BASE_ADVISORY, external_id: null, vtec_event_id: null, vtec_code: null }))
      .rejects.toThrow('DB fail');
    spy.mockRestore();
  });

  test('extracts external_id from raw_payload string', async () => {
    const spy = jest.spyOn(console, 'log').mockImplementation();
    const advisory = {
      ...BASE_ADVISORY,
      external_id: null,
      vtec_event_id: null,
      vtec_code: null,
      raw_payload: JSON.stringify({ id: 'urn:extracted-id' })
    };

    // findByExternalID returns existing match
    const existing = { id: 88, ...advisory, external_id: 'urn:extracted-id' };
    const db = makeDb([
      [[existing], {}],  // findByExternalID
      [{}, {}],          // UPDATE
      [[existing], {}]   // getById
    ]);
    getDatabase.mockReturnValue(db);
    const updateSpy = jest.spyOn(AdvisoryModel, 'update').mockResolvedValue(existing);

    const result = await AdvisoryModel.create(advisory);

    expect(result).toEqual(existing);
    updateSpy.mockRestore();
    spy.mockRestore();
  });
});

// ── getCountBySeverity error ────────────────────────────────────────────────

describe('AdvisoryModel.getCountBySeverity() — error path', () => {
  test('returns empty array on DB error', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation();
    const db = { query: jest.fn().mockRejectedValue(new Error('DB fail')) };
    getDatabase.mockReturnValue(db);

    const result = await AdvisoryModel.getCountBySeverity();

    expect(result).toEqual([]);
    spy.mockRestore();
  });
});

// ── getRecentlyUpdated error ────────────────────────────────────────────────

describe('AdvisoryModel.getRecentlyUpdated() — error path', () => {
  test('returns empty array on DB error', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation();
    const db = { query: jest.fn().mockRejectedValue(new Error('DB fail')) };
    getDatabase.mockReturnValue(db);

    const result = await AdvisoryModel.getRecentlyUpdated();

    expect(result).toEqual([]);
    spy.mockRestore();
  });
});
