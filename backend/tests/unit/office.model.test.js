'use strict';

/**
 * Unit tests for src/models/office.js
 * All database calls are mocked via jest.mock so no live DB is needed.
 */

jest.mock('../../src/config/database', () => ({
  getDatabase: jest.fn()
}));

const { getDatabase } = require('../../src/config/database');
const OfficeModel     = require('../../src/models/office');

function makeDb(rows = []) {
  return { query: jest.fn().mockResolvedValue([rows, {}]) };
}

const SAMPLE_OFFICE = { id: 1, office_code: '46201', name: 'Indianapolis', city: 'Indianapolis', state: 'IN', latitude: 39.77, longitude: -86.16 };

afterEach(() => jest.clearAllMocks());

// ── getAll ────────────────────────────────────────────────────────────────

describe('OfficeModel.getAll()', () => {
  test('returns all offices when no filters', async () => {
    const db = makeDb([SAMPLE_OFFICE]);
    getDatabase.mockReturnValue(db);

    const result = await OfficeModel.getAll();

    expect(result).toEqual([SAMPLE_OFFICE]);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY state, city'),
      []
    );
  });

  test('adds WHERE state = ? when state filter provided', async () => {
    const db = makeDb([SAMPLE_OFFICE]);
    getDatabase.mockReturnValue(db);

    await OfficeModel.getAll({ state: 'IN' });

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('state = ?'),
      ['IN']
    );
  });

  test('adds WHERE region = ? when region filter provided', async () => {
    const db = makeDb([]);
    getDatabase.mockReturnValue(db);

    await OfficeModel.getAll({ region: 'Midwest' });

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('region = ?'),
      ['Midwest']
    );
  });

  test('combines state + region filters with AND', async () => {
    const db = makeDb([]);
    getDatabase.mockReturnValue(db);

    await OfficeModel.getAll({ state: 'IN', region: 'Midwest' });

    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain('state = ?');
    expect(sql).toContain('region = ?');
    expect(db.query.mock.calls[0][1]).toEqual(['IN', 'Midwest']);
  });
});

// ── getById ───────────────────────────────────────────────────────────────

describe('OfficeModel.getById()', () => {
  test('returns office when found', async () => {
    const db = makeDb([SAMPLE_OFFICE]);
    getDatabase.mockReturnValue(db);

    const result = await OfficeModel.getById(1);

    expect(result).toEqual(SAMPLE_OFFICE);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('id = ?'), [1]);
  });

  test('returns null when not found', async () => {
    const db = makeDb([]);
    getDatabase.mockReturnValue(db);

    const result = await OfficeModel.getById(9999);

    expect(result).toBeNull();
  });
});

// ── getByOfficeCode ──────────────────────────────────────────────────────

describe('OfficeModel.getByOfficeCode()', () => {
  test('returns office by code', async () => {
    const db = makeDb([SAMPLE_OFFICE]);
    getDatabase.mockReturnValue(db);

    const result = await OfficeModel.getByOfficeCode('46201');

    expect(result).toEqual(SAMPLE_OFFICE);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('office_code = ?'), ['46201']);
  });

  test('returns null when code not found', async () => {
    const db = makeDb([]);
    getDatabase.mockReturnValue(db);

    expect(await OfficeModel.getByOfficeCode('00000')).toBeNull();
  });
});

// ── getByIds ──────────────────────────────────────────────────────────────

describe('OfficeModel.getByIds()', () => {
  test('returns offices for given IDs', async () => {
    const db = makeDb([SAMPLE_OFFICE]);
    getDatabase.mockReturnValue(db);

    const result = await OfficeModel.getByIds([1, 2]);

    expect(result).toEqual([SAMPLE_OFFICE]);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('IN (?,?)'), [1, 2]);
  });

  test('returns empty array for empty input', async () => {
    expect(await OfficeModel.getByIds([])).toEqual([]);
    expect(await OfficeModel.getByIds(null)).toEqual([]);
  });
});

// ── getByState ────────────────────────────────────────────────────────────

describe('OfficeModel.getByState()', () => {
  test('returns offices ordered by city', async () => {
    const db = makeDb([SAMPLE_OFFICE]);
    getDatabase.mockReturnValue(db);

    await OfficeModel.getByState('IN');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY city'),
      ['IN']
    );
  });
});

// ── findNearby ────────────────────────────────────────────────────────────

describe('OfficeModel.findNearby()', () => {
  test('uses bounding-box pre-filter with correct param count', async () => {
    const db = makeDb([]);
    getDatabase.mockReturnValue(db);

    await OfficeModel.findNearby(39.77, -86.16, 50);

    // 11 params: lat, lon, lat, lat-delta, lat+delta, lon-delta, lon+delta, lat, lon, lat, radius
    expect(db.query.mock.calls[0][1]).toHaveLength(11);
    expect(db.query.mock.calls[0][1][10]).toBe(50); // radiusMiles is last param
  });

  test('defaults radiusMiles to 50 when not provided', async () => {
    const db = makeDb([]);
    getDatabase.mockReturnValue(db);

    await OfficeModel.findNearby(39.77, -86.16);

    expect(db.query.mock.calls[0][1][10]).toBe(50);
  });
});

// ── getCountByState, getStates, getRegions ────────────────────────────────

describe('OfficeModel.getCountByState()', () => {
  test('returns state/count rows', async () => {
    const rows = [{ state: 'IN', count: 5 }];
    const db = makeDb(rows);
    getDatabase.mockReturnValue(db);

    expect(await OfficeModel.getCountByState()).toEqual(rows);
  });
});

describe('OfficeModel.getStates()', () => {
  test('returns flat array of state codes', async () => {
    const db = makeDb([{ state: 'CA' }, { state: 'IN' }]);
    getDatabase.mockReturnValue(db);

    expect(await OfficeModel.getStates()).toEqual(['CA', 'IN']);
  });
});

describe('OfficeModel.getRegions()', () => {
  test('returns flat array of region names', async () => {
    const db = makeDb([{ region: 'Midwest' }, { region: 'West' }]);
    getDatabase.mockReturnValue(db);

    expect(await OfficeModel.getRegions()).toEqual(['Midwest', 'West']);
  });
});
