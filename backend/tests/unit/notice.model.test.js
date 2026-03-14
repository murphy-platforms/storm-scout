'use strict';

/**
 * Unit tests for src/models/notice.js
 */

jest.mock('../../src/config/database', () => ({
  getDatabase: jest.fn()
}));

const { getDatabase } = require('../../src/config/database');
const NoticeModel     = require('../../src/models/notice');

function makeDb(rows = []) {
  return { query: jest.fn().mockResolvedValue([rows, {}]) };
}

afterEach(() => jest.clearAllMocks());

// ── getAll ─────────────────────────────────────────────────────────────────

describe('NoticeModel.getAll()', () => {
  test('returns all notices without filters', async () => {
    const db = makeDb([{ id: 1 }]);
    getDatabase.mockReturnValue(db);

    const result = await NoticeModel.getAll();

    expect(result).toEqual([{ id: 1 }]);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('WHERE 1=1'), []);
  });

  test('adds jurisdiction_type filter', async () => {
    const db = makeDb([]);
    getDatabase.mockReturnValue(db);

    await NoticeModel.getAll({ jurisdiction_type: 'Federal' });

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('jurisdiction_type = ?'),
      ['Federal']
    );
  });

  test('adds notice_type filter', async () => {
    const db = makeDb([]);
    getDatabase.mockReturnValue(db);

    await NoticeModel.getAll({ notice_type: 'Emergency Declaration' });

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('notice_type = ?'),
      ['Emergency Declaration']
    );
  });

  test('adds state filter', async () => {
    const db = makeDb([]);
    getDatabase.mockReturnValue(db);

    await NoticeModel.getAll({ state: 'IN' });

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('jurisdiction = ?'),
      ['IN']
    );
  });

  test('returns empty array on error', async () => {
    const db = { query: jest.fn().mockRejectedValue(new Error('DB error')) };
    getDatabase.mockReturnValue(db);

    expect(await NoticeModel.getAll()).toEqual([]);
  });
});

// ── getActive ──────────────────────────────────────────────────────────────

describe('NoticeModel.getActive()', () => {
  test('filters by effective/expiration time', async () => {
    const db = makeDb([]);
    getDatabase.mockReturnValue(db);

    await NoticeModel.getActive();

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('effective_time <= ?'),
      expect.arrayContaining([expect.any(String)])
    );
  });

  test('adds jurisdiction_type filter', async () => {
    const db = makeDb([]);
    getDatabase.mockReturnValue(db);

    await NoticeModel.getActive({ jurisdiction_type: 'State' });

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('jurisdiction_type = ?'),
      expect.arrayContaining(['State'])
    );
  });

  test('adds state filter', async () => {
    const db = makeDb([]);
    getDatabase.mockReturnValue(db);

    await NoticeModel.getActive({ state: 'CA' });

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('jurisdiction = ?'),
      expect.arrayContaining(['CA'])
    );
  });

  test('returns empty array on error', async () => {
    const db = { query: jest.fn().mockRejectedValue(new Error('fail')) };
    getDatabase.mockReturnValue(db);

    expect(await NoticeModel.getActive()).toEqual([]);
  });
});

// ── getById ────────────────────────────────────────────────────────────────

describe('NoticeModel.getById()', () => {
  test('returns notice when found', async () => {
    const db = makeDb([{ id: 5, notice_type: 'Closure' }]);
    getDatabase.mockReturnValue(db);

    expect(await NoticeModel.getById(5)).toEqual({ id: 5, notice_type: 'Closure' });
  });

  test('returns null when not found', async () => {
    const db = makeDb([]);
    getDatabase.mockReturnValue(db);

    expect(await NoticeModel.getById(999)).toBeNull();
  });

  test('returns null on error', async () => {
    const db = { query: jest.fn().mockRejectedValue(new Error('fail')) };
    getDatabase.mockReturnValue(db);

    expect(await NoticeModel.getById(1)).toBeNull();
  });
});

// ── getCountByType ─────────────────────────────────────────────────────────

describe('NoticeModel.getCountByType()', () => {
  test('counts active notices by type (default)', async () => {
    const db = makeDb([{ notice_type: 'Closure', count: 3 }]);
    getDatabase.mockReturnValue(db);

    const result = await NoticeModel.getCountByType(true);

    expect(result).toEqual([{ notice_type: 'Closure', count: 3 }]);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('effective_time <= ?'),
      expect.any(Array)
    );
  });

  test('counts all notices when activeOnly=false', async () => {
    const db = makeDb([{ notice_type: 'Closure', count: 5 }]);
    getDatabase.mockReturnValue(db);

    const result = await NoticeModel.getCountByType(false);

    expect(result).toEqual([{ notice_type: 'Closure', count: 5 }]);
    // activeOnly=false → no WHERE clause, no params array
    expect(db.query).toHaveBeenCalledWith(expect.not.stringContaining('effective_time'));
  });

  test('returns empty array on error', async () => {
    const db = { query: jest.fn().mockRejectedValue(new Error('fail')) };
    getDatabase.mockReturnValue(db);

    expect(await NoticeModel.getCountByType()).toEqual([]);
  });
});
