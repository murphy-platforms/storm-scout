'use strict';

/**
 * Unit tests for src/models/ingestionEvent.js
 */

jest.mock('../../src/config/database', () => ({
  getDatabase: jest.fn()
}));

const { getDatabase }  = require('../../src/config/database');
const IngestionEvent   = require('../../src/models/ingestionEvent');

function makeDb(rows = []) {
  return { query: jest.fn().mockResolvedValue([rows, {}]) };
}

afterEach(() => jest.clearAllMocks());

// ── recordStart ────────────────────────────────────────────────────────────

describe('IngestionEvent.recordStart()', () => {
  test('inserts running event and returns id', async () => {
    const db = makeDb({ insertId: 10 });
    getDatabase.mockReturnValue(db);

    const id = await IngestionEvent.recordStart();

    expect(id).toBe(10);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("status) VALUES (NOW(), 'running')"));
  });
});

// ── recordSuccess ──────────────────────────────────────────────────────────

describe('IngestionEvent.recordSuccess()', () => {
  test('updates event with success status and stats', async () => {
    const db = makeDb({ affectedRows: 1 });
    getDatabase.mockReturnValue(db);

    await IngestionEvent.recordSuccess(10, { advisoriesCreated: 50, advisoriesExpired: 5, durationMs: 3000 });

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'success'"),
      [50, 5, 3000, 10]
    );
  });

  test('uses default values when stats omitted', async () => {
    const db = makeDb({ affectedRows: 1 });
    getDatabase.mockReturnValue(db);

    await IngestionEvent.recordSuccess(5);

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'success'"),
      [0, 0, 0, 5]
    );
  });
});

// ── recordFailure ──────────────────────────────────────────────────────────

describe('IngestionEvent.recordFailure()', () => {
  test('updates event with failure status and error', async () => {
    const db = makeDb({ affectedRows: 1 });
    getDatabase.mockReturnValue(db);

    await IngestionEvent.recordFailure(10, 'NOAA API timeout', 5000);

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'failure'"),
      ['NOAA API timeout', 5000, 10]
    );
  });

  test('defaults durationMs to 0 when not provided', async () => {
    const db = makeDb({ affectedRows: 1 });
    getDatabase.mockReturnValue(db);

    await IngestionEvent.recordFailure(10, 'timeout');

    expect(db.query).toHaveBeenCalledWith(
      expect.anything(),
      ['timeout', 0, 10]
    );
  });
});

// ── getLastSuccessful ──────────────────────────────────────────────────────

describe('IngestionEvent.getLastSuccessful()', () => {
  test('returns lastUpdated and minutesAgo when found', async () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const db = makeDb([{ completed_at: fiveMinAgo }]);
    getDatabase.mockReturnValue(db);

    const result = await IngestionEvent.getLastSuccessful();

    expect(result).not.toBeNull();
    expect(result.lastUpdated).toBe(fiveMinAgo.toISOString());
    expect(result.minutesAgo).toBeGreaterThanOrEqual(4);
    expect(result.minutesAgo).toBeLessThanOrEqual(6);
  });

  test('returns null when no successful events', async () => {
    const db = makeDb([]);
    getDatabase.mockReturnValue(db);

    expect(await IngestionEvent.getLastSuccessful()).toBeNull();
  });

  test('returns null when completed_at is null', async () => {
    const db = makeDb([{ completed_at: null }]);
    getDatabase.mockReturnValue(db);

    expect(await IngestionEvent.getLastSuccessful()).toBeNull();
  });
});
