'use strict';

/**
 * Unit tests for src/models/officeStatus.js
 */

jest.mock('../../src/config/database', () => ({
  getDatabase: jest.fn()
}));

const { getDatabase }    = require('../../src/config/database');
const OfficeStatusModel  = require('../../src/models/officeStatus');

function makeDb(rows = []) {
  return { query: jest.fn().mockResolvedValue([rows, {}]) };
}

afterEach(() => jest.clearAllMocks());

// ── getAll ─────────────────────────────────────────────────────────────────

describe('OfficeStatusModel.getAll()', () => {
  test('returns all statuses without filters', async () => {
    const row = { office_id: 1, operational_status: 'Open' };
    const db = makeDb([row]);
    getDatabase.mockReturnValue(db);

    expect(await OfficeStatusModel.getAll()).toEqual([row]);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('WHERE 1=1'), []);
  });

  test('filters by operational_status', async () => {
    const db = makeDb([]);
    getDatabase.mockReturnValue(db);

    await OfficeStatusModel.getAll({ operational_status: 'Closed' });

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('operational_status = ?'),
      ['Closed']
    );
  });

  test('filters by state', async () => {
    const db = makeDb([]);
    getDatabase.mockReturnValue(db);

    await OfficeStatusModel.getAll({ state: 'CA' });

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('s.state = ?'),
      ['CA']
    );
  });
});

// ── getByOffice ────────────────────────────────────────────────────────────

describe('OfficeStatusModel.getByOffice()', () => {
  test('returns status when found', async () => {
    const row = { office_id: 1, operational_status: 'Open' };
    const db = makeDb([row]);
    getDatabase.mockReturnValue(db);

    expect(await OfficeStatusModel.getByOffice(1)).toEqual(row);
  });

  test('returns null when not found', async () => {
    const db = makeDb([]);
    getDatabase.mockReturnValue(db);

    expect(await OfficeStatusModel.getByOffice(999)).toBeNull();
  });
});

// ── getByStatus ────────────────────────────────────────────────────────────

describe('OfficeStatusModel.getByStatus()', () => {
  test('delegates to getAll with operational_status filter', async () => {
    const db = makeDb([]);
    getDatabase.mockReturnValue(db);

    await OfficeStatusModel.getByStatus('Closed');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('operational_status = ?'),
      ['Closed']
    );
  });
});

// ── getImpacted ────────────────────────────────────────────────────────────

describe('OfficeStatusModel.getImpacted()', () => {
  test('returns offices with Closed or At Risk status', async () => {
    const rows = [{ office_id: 1, operational_status: 'Closed', advisory_count: 2 }];
    const db = makeDb(rows);
    getDatabase.mockReturnValue(db);

    const result = await OfficeStatusModel.getImpacted();

    expect(result).toEqual(rows);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("IN ('Closed', 'At Risk')")
    );
  });
});

// ── upsert ─────────────────────────────────────────────────────────────────

describe('OfficeStatusModel.upsert()', () => {
  test('inserts with operational_status field', async () => {
    const db = makeDb([{ office_id: 1, operational_status: 'Closed' }]);
    getDatabase.mockReturnValue(db);

    const result = await OfficeStatusModel.upsert(1, { operational_status: 'Closed' });

    // First call is INSERT, second is getByOffice SELECT
    expect(db.query).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ office_id: 1, operational_status: 'Closed' });
  });

  test('handles legacy string format', async () => {
    const db = makeDb([{ office_id: 1, operational_status: 'Open' }]);
    getDatabase.mockReturnValue(db);

    const result = await OfficeStatusModel.upsert(1, 'Open');

    expect(db.query).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ office_id: 1, operational_status: 'Open' });
  });

  test('includes weather_impact_level when provided', async () => {
    const db = makeDb([{ office_id: 1 }]);
    getDatabase.mockReturnValue(db);

    await OfficeStatusModel.upsert(1, { weather_impact_level: 'red' });

    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain('weather_impact_level');
  });

  test('includes decision_by and auto-sets decision_at', async () => {
    const db = makeDb([{ office_id: 1 }]);
    getDatabase.mockReturnValue(db);

    await OfficeStatusModel.upsert(1, { decision_by: 'admin', decision_reason: 'storm' });

    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain('decision_by');
    expect(sql).toContain('decision_at = NOW()');
    expect(sql).toContain('decision_reason');
  });
});

// ── getCountByStatus ───────────────────────────────────────────────────────

describe('OfficeStatusModel.getCountByStatus()', () => {
  test('returns grouped status counts', async () => {
    const rows = [{ operational_status: 'Open', count: 5 }];
    const db = makeDb(rows);
    getDatabase.mockReturnValue(db);

    expect(await OfficeStatusModel.getCountByStatus()).toEqual(rows);
  });
});

// ── getCountByWeatherImpact ────────────────────────────────────────────────

describe('OfficeStatusModel.getCountByWeatherImpact()', () => {
  test('returns grouped impact counts', async () => {
    const rows = [{ weather_impact_level: 'green', count: 10 }];
    const db = makeDb(rows);
    getDatabase.mockReturnValue(db);

    expect(await OfficeStatusModel.getCountByWeatherImpact()).toEqual(rows);
  });
});

// ── getRecentlyUpdated ─────────────────────────────────────────────────────

describe('OfficeStatusModel.getRecentlyUpdated()', () => {
  test('passes limit parameter', async () => {
    const db = makeDb([]);
    getDatabase.mockReturnValue(db);

    await OfficeStatusModel.getRecentlyUpdated(5);

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('LIMIT ?'),
      [5]
    );
  });

  test('defaults to limit 10', async () => {
    const db = makeDb([]);
    getDatabase.mockReturnValue(db);

    await OfficeStatusModel.getRecentlyUpdated();

    expect(db.query).toHaveBeenCalledWith(expect.any(String), [10]);
  });
});

// ── bulkSetOperationalStatus ───────────────────────────────────────────────

describe('OfficeStatusModel.bulkSetOperationalStatus()', () => {
  test('returns affected row count', async () => {
    const db = { query: jest.fn().mockResolvedValue([{ affectedRows: 3 }, {}]) };
    getDatabase.mockReturnValue(db);

    const result = await OfficeStatusModel.bulkSetOperationalStatus([1, 2, 3], 'Closed', 'admin', 'storm');

    expect(result).toBe(3);
  });
});
