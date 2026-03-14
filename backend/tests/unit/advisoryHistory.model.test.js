'use strict';

/**
 * Unit tests for src/models/advisoryHistory.js
 * All database calls are mocked via jest.mock.
 */

jest.mock('../../src/config/database', () => ({
  getDatabase: jest.fn()
}));

const { getDatabase } = require('../../src/config/database');
const AdvisoryHistory  = require('../../src/models/advisoryHistory');

function makeDb(queryResults = []) {
  let callIndex = 0;
  return {
    query: jest.fn(async () => {
      const result = queryResults[callIndex] ?? [[], {}];
      callIndex++;
      return result;
    })
  };
}

afterEach(() => jest.clearAllMocks());

// ── createSnapshot ─────────────────────────────────────────────────────────

describe('AdvisoryHistory.createSnapshot()', () => {
  const aggregated = {
    advisory_count: 3,
    highest_severity: 'Severe',
    highest_severity_type: 'Winter Storm Warning',
    has_extreme: false,
    has_severe: true,
    has_moderate: true,
    new_count: 1,
    upgrade_count: 0,
    advisories: [
      { id: 1, advisory_type: 'Winter Storm Warning', severity: 'Severe', vtec_action: 'NEW' },
      { id: 2, advisory_type: 'Wind Advisory', severity: 'Moderate', vtec_action: 'CON' },
      { id: 3, advisory_type: 'Frost Advisory', severity: 'Moderate', vtec_action: 'CON' }
    ]
  };

  test('inserts snapshot and returns insertId', async () => {
    const db = makeDb([[{ insertId: 42 }, {}]]);
    getDatabase.mockReturnValue(db);

    const id = await AdvisoryHistory.createSnapshot(1, aggregated);

    expect(id).toBe(42);
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO advisory_history'),
      expect.arrayContaining([1, 3, 'Severe', 'Winter Storm Warning'])
    );
  });

  test('serializes advisory_snapshot as JSON', async () => {
    const db = makeDb([[{ insertId: 1 }, {}]]);
    getDatabase.mockReturnValue(db);

    await AdvisoryHistory.createSnapshot(5, aggregated);

    const params = db.query.mock.calls[0][1];
    const snapshotJson = params[params.length - 1];
    const parsed = JSON.parse(snapshotJson);
    expect(parsed.advisories).toHaveLength(3);
    expect(parsed.advisories[0]).toEqual({ id: 1, type: 'Winter Storm Warning', severity: 'Severe', action: 'NEW' });
  });
});

// ── createSnapshotsForAllOffices ────────────────────────────────────────────

describe('AdvisoryHistory.createSnapshotsForAllOffices()', () => {
  test('calls createSnapshot for each office in parallel', async () => {
    const spy = jest.spyOn(AdvisoryHistory, 'createSnapshot').mockResolvedValue(1);

    const offices = [
      { office_id: 1, advisory_count: 1, highest_severity: 'Minor', highest_severity_type: 'Frost Advisory', has_extreme: false, has_severe: false, has_moderate: false, new_count: 0, upgrade_count: 0, advisories: [] },
      { office_id: 2, advisory_count: 2, highest_severity: 'Severe', highest_severity_type: 'Flood Warning', has_extreme: false, has_severe: true, has_moderate: false, new_count: 1, upgrade_count: 0, advisories: [] }
    ];

    const ids = await AdvisoryHistory.createSnapshotsForAllOffices(offices);

    expect(spy).toHaveBeenCalledTimes(2);
    expect(ids).toEqual([1, 1]);
    spy.mockRestore();
  });
});

// ── getHistoryForSite ──────────────────────────────────────────────────────

describe('AdvisoryHistory.getHistoryForSite()', () => {
  test('returns rows in chronological order', async () => {
    const rows = [{ id: 1, snapshot_time: '2026-03-01' }, { id: 2, snapshot_time: '2026-03-02' }];
    const db = makeDb([[rows, {}]]);
    getDatabase.mockReturnValue(db);

    const result = await AdvisoryHistory.getHistoryForSite(42, 7);

    expect(result).toEqual(rows);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('ORDER BY snapshot_time ASC'), [42, 7]);
  });

  test('returns empty array when no history', async () => {
    const db = makeDb([[[], {}]]);
    getDatabase.mockReturnValue(db);

    const result = await AdvisoryHistory.getHistoryForSite(99);

    expect(result).toEqual([]);
  });
});

// ── getLatestSnapshot ──────────────────────────────────────────────────────

describe('AdvisoryHistory.getLatestSnapshot()', () => {
  test('returns most recent snapshot', async () => {
    const row = { id: 5, office_id: 1, highest_severity: 'Moderate' };
    const db = makeDb([[[row], {}]]);
    getDatabase.mockReturnValue(db);

    const result = await AdvisoryHistory.getLatestSnapshot(1);

    expect(result).toEqual(row);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('ORDER BY snapshot_time DESC'), [1]);
  });

  test('returns null when no snapshots exist', async () => {
    const db = makeDb([[[], {}]]);
    getDatabase.mockReturnValue(db);

    expect(await AdvisoryHistory.getLatestSnapshot(999)).toBeNull();
  });
});

// ── getTrend ───────────────────────────────────────────────────────────────

describe('AdvisoryHistory.getTrend()', () => {
  test('returns insufficient_data when fewer than 2 snapshots', async () => {
    const db = makeDb([[[{ id: 1 }], {}]]);
    getDatabase.mockReturnValue(db);

    const result = await AdvisoryHistory.getTrend(1, 7);

    expect(result.trend).toBe('insufficient_data');
    expect(result.history).toHaveLength(1);
  });

  test('returns worsening when severity increases', async () => {
    const history = [
      { id: 1, snapshot_time: '2026-03-01T00:00:00Z', highest_severity: 'Minor', advisory_count: 1 },
      { id: 2, snapshot_time: '2026-03-03T00:00:00Z', highest_severity: 'Severe', advisory_count: 3 }
    ];
    const db = makeDb([[history, {}]]);
    getDatabase.mockReturnValue(db);

    const result = await AdvisoryHistory.getTrend(1, 7);

    expect(result.trend).toBe('worsening');
    expect(result.severity_change).toBe(2); // Severe(3) - Minor(1)
    expect(result.advisory_change).toBe(2);
  });

  test('returns improving when severity decreases', async () => {
    const history = [
      { id: 1, snapshot_time: '2026-03-01T00:00:00Z', highest_severity: 'Extreme', advisory_count: 5 },
      { id: 2, snapshot_time: '2026-03-03T00:00:00Z', highest_severity: 'Moderate', advisory_count: 2 }
    ];
    const db = makeDb([[history, {}]]);
    getDatabase.mockReturnValue(db);

    const result = await AdvisoryHistory.getTrend(1, 7);

    expect(result.trend).toBe('improving');
    expect(result.severity_change).toBe(-2); // Moderate(2) - Extreme(4)
  });

  test('returns stable when severity unchanged', async () => {
    const history = [
      { id: 1, snapshot_time: '2026-03-01T00:00:00Z', highest_severity: 'Moderate', advisory_count: 2 },
      { id: 2, snapshot_time: '2026-03-02T00:00:00Z', highest_severity: 'Moderate', advisory_count: 3 }
    ];
    const db = makeDb([[history, {}]]);
    getDatabase.mockReturnValue(db);

    const result = await AdvisoryHistory.getTrend(1, 7);

    expect(result.trend).toBe('stable');
    expect(result.severity_change).toBe(0);
    expect(result.advisory_change).toBe(1);
  });

  test('calculates duration_hours correctly', async () => {
    const history = [
      { id: 1, snapshot_time: '2026-03-01T00:00:00Z', highest_severity: 'Minor', advisory_count: 1 },
      { id: 2, snapshot_time: '2026-03-03T00:00:00Z', highest_severity: 'Minor', advisory_count: 1 }
    ];
    const db = makeDb([[history, {}]]);
    getDatabase.mockReturnValue(db);

    const result = await AdvisoryHistory.getTrend(1, 7);

    expect(result.duration_hours).toBe(48);
  });
});

// ── getAllTrends ────────────────────────────────────────────────────────────

describe('AdvisoryHistory.getAllTrends()', () => {
  test('groups rows by office_id and computes trends based on advisory_count', async () => {
    const rows = [
      { office_id: 1, snapshot_time: '2026-03-01T00:00:00Z', highest_severity: 'Minor', advisory_count: 1 },
      { office_id: 1, snapshot_time: '2026-03-03T00:00:00Z', highest_severity: 'Severe', advisory_count: 3 },
      { office_id: 2, snapshot_time: '2026-03-01T00:00:00Z', highest_severity: 'Moderate', advisory_count: 2 },
      { office_id: 2, snapshot_time: '2026-03-03T00:00:00Z', highest_severity: 'Moderate', advisory_count: 1 }
    ];
    const db = makeDb([[rows, {}]]);
    getDatabase.mockReturnValue(db);

    const trends = await AdvisoryHistory.getAllTrends(7);

    expect(trends).toHaveLength(2);
    const t1 = trends.find(t => t.office_id === 1);
    const t2 = trends.find(t => t.office_id === 2);
    expect(t1.trend).toBe('increasing');   // count 1 → 3
    expect(t2.trend).toBe('decreasing');   // count 2 → 1
  });

  test('returns stable for offices with only one snapshot', async () => {
    const rows = [
      { office_id: 1, snapshot_time: '2026-03-01T00:00:00Z', highest_severity: 'Minor', advisory_count: 1 }
    ];
    const db = makeDb([[rows, {}]]);
    getDatabase.mockReturnValue(db);

    const trends = await AdvisoryHistory.getAllTrends(7);

    expect(trends).toHaveLength(1);
    expect(trends[0].trend).toBe('stable');
  });

  test('returns stable when advisory count unchanged', async () => {
    const rows = [
      { office_id: 1, snapshot_time: '2026-03-01T00:00:00Z', highest_severity: 'Minor', advisory_count: 2 },
      { office_id: 1, snapshot_time: '2026-03-03T00:00:00Z', highest_severity: 'Minor', advisory_count: 2 }
    ];
    const db = makeDb([[rows, {}]]);
    getDatabase.mockReturnValue(db);

    const trends = await AdvisoryHistory.getAllTrends(7);

    expect(trends[0].trend).toBe('stable');
  });

  test('returns empty array when no history rows', async () => {
    const db = makeDb([[[], {}]]);
    getDatabase.mockReturnValue(db);

    const trends = await AdvisoryHistory.getAllTrends(7);

    expect(trends).toEqual([]);
  });
});

// ── cleanupOldHistory ──────────────────────────────────────────────────────

describe('AdvisoryHistory.cleanupOldHistory()', () => {
  test('deletes old rows and returns count', async () => {
    const db = makeDb([[{ affectedRows: 15 }, {}]]);
    getDatabase.mockReturnValue(db);

    const deleted = await AdvisoryHistory.cleanupOldHistory(30);

    expect(deleted).toBe(15);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM advisory_history'), [30]);
  });

  test('defaults to 30 days', async () => {
    const db = makeDb([[{ affectedRows: 0 }, {}]]);
    getDatabase.mockReturnValue(db);

    await AdvisoryHistory.cleanupOldHistory();

    expect(db.query).toHaveBeenCalledWith(expect.anything(), [30]);
  });
});
