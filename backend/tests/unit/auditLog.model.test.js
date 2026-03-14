'use strict';

/**
 * Unit tests for src/models/auditLog.js
 */

jest.mock('../../src/config/database', () => ({
  getDatabase: jest.fn()
}));

const { getDatabase } = require('../../src/config/database');
const AuditLog        = require('../../src/models/auditLog');

function makeDb(rows = []) {
  return { query: jest.fn().mockResolvedValue([rows, {}]) };
}

afterEach(() => jest.clearAllMocks());

// ── record ─────────────────────────────────────────────────────────────────

describe('AuditLog.record()', () => {
  test('inserts entry and returns insertId', async () => {
    const db = makeDb({ insertId: 7 });
    getDatabase.mockReturnValue(db);

    const id = await AuditLog.record({ action: 'pause_ingestion', ipAddress: '127.0.0.1' });

    expect(id).toBe(7);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_log'),
      ['pause_ingestion', 'api_key', null, '127.0.0.1']
    );
  });

  test('serializes detail object to JSON', async () => {
    const db = makeDb({ insertId: 1 });
    getDatabase.mockReturnValue(db);

    await AuditLog.record({ action: 'test', detail: { wasInProgress: true } });

    const params = db.query.mock.calls[0][1];
    expect(params[2]).toBe('{"wasInProgress":true}');
  });

  test('passes string detail as-is', async () => {
    const db = makeDb({ insertId: 1 });
    getDatabase.mockReturnValue(db);

    await AuditLog.record({ action: 'test', detail: 'raw detail string' });

    const params = db.query.mock.calls[0][1];
    expect(params[2]).toBe('raw detail string');
  });

  test('uses custom actor when provided', async () => {
    const db = makeDb({ insertId: 1 });
    getDatabase.mockReturnValue(db);

    await AuditLog.record({ action: 'test', actor: 'admin_user' });

    const params = db.query.mock.calls[0][1];
    expect(params[1]).toBe('admin_user');
  });
});

// ── getRecent ──────────────────────────────────────────────────────────────

describe('AuditLog.getRecent()', () => {
  test('returns rows with default limit', async () => {
    const rows = [{ id: 1, action: 'pause_ingestion' }];
    const db = makeDb(rows);
    getDatabase.mockReturnValue(db);

    const result = await AuditLog.getRecent();

    expect(result).toEqual(rows);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('LIMIT ?'), [50]);
  });

  test('uses custom limit', async () => {
    const db = makeDb([]);
    getDatabase.mockReturnValue(db);

    await AuditLog.getRecent(10);

    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('LIMIT ?'), [10]);
  });
});
