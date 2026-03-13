/**
 * Unit tests for advisory cleanup module
 * Tests deduplication logic, expired advisory removal, batch operations,
 * and cleanup mode orchestration
 *
 * Database calls are mocked — these tests validate logic, not SQL.
 */

// Mock database module
const mockQuery = jest.fn();
const mockGetConnection = jest.fn();
const mockConnection = {
  beginTransaction: jest.fn(),
  query: jest.fn(),
  commit: jest.fn(),
  rollback: jest.fn(),
  release: jest.fn()
};

jest.mock('../../src/config/database', () => ({
  initDatabase: jest.fn().mockResolvedValue(),
  getDatabase: jest.fn(() => ({
    query: mockQuery,
    getConnection: mockGetConnection
  })),
  closeDatabase: jest.fn().mockResolvedValue()
}));

// Mock alerting module
jest.mock('../../src/utils/alerting', () => ({
  alertCleanupFailure: jest.fn().mockResolvedValue()
}));

const {
  batchDelete,
  removeDuplicatesByExternalId,
  removeDuplicatesByVTECEventId,
  removeDuplicatesByVTECCode,
  removeDuplicateTypes,
  markExpiredByEndTime,
  removeExpiredAdvisories,
  checkSchema,
  runCleanup,
  BATCH_SIZE
} = require('../../src/utils/cleanup-advisories');

// Suppress console noise during tests
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  // Prevent process.exit from killing test runner
  jest.spyOn(process, 'exit').mockImplementation(() => {});
});
afterAll(() => {
  console.log.mockRestore();
  console.warn.mockRestore();
  console.error.mockRestore();
  process.exit.mockRestore();
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetConnection.mockResolvedValue(mockConnection);
});

describe('BATCH_SIZE constant', () => {
  test('should be 1000', () => {
    expect(BATCH_SIZE).toBe(1000);
  });
});

describe('batchDelete', () => {
  test('should return 0 for empty ID array', async () => {
    const result = await batchDelete([]);
    expect(result).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('should delete IDs in a single batch when under BATCH_SIZE', async () => {
    const ids = [1, 2, 3, 4, 5];
    mockQuery.mockResolvedValueOnce([{ affectedRows: 5 }]);

    const result = await batchDelete(ids);
    expect(result).toBe(5);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery).toHaveBeenCalledWith(
      'DELETE FROM advisories WHERE id IN (?)',
      [ids]
    );
  });

  test('should use custom table name', async () => {
    const ids = [1, 2];
    mockQuery.mockResolvedValueOnce([{ affectedRows: 2 }]);

    await batchDelete(ids, 'custom_table');
    expect(mockQuery).toHaveBeenCalledWith(
      'DELETE FROM custom_table WHERE id IN (?)',
      [ids]
    );
  });

  test('should split large ID arrays into batches', async () => {
    // Create array larger than BATCH_SIZE
    const ids = Array.from({ length: 2500 }, (_, i) => i + 1);
    mockQuery
      .mockResolvedValueOnce([{ affectedRows: 1000 }])
      .mockResolvedValueOnce([{ affectedRows: 1000 }])
      .mockResolvedValueOnce([{ affectedRows: 500 }]);

    const result = await batchDelete(ids);
    expect(result).toBe(2500);
    expect(mockQuery).toHaveBeenCalledTimes(3);
  });
});

describe('removeDuplicatesByExternalId', () => {
  test('should return 0 when no duplicates found', async () => {
    mockQuery.mockResolvedValueOnce([[]]);

    const result = await removeDuplicatesByExternalId();
    expect(result).toBe(0);
  });

  test('should remove duplicates keeping newest (highest ID)', async () => {
    // Simulate finding duplicates: external_id "abc" has IDs 10,5,3 (DESC order)
    mockQuery
      .mockResolvedValueOnce([[
        { external_id: 'abc', site_id: 1, ids: '10,5,3', count: 3 }
      ]])
      // batchDelete query
      .mockResolvedValueOnce([{ affectedRows: 2 }]);

    const result = await removeDuplicatesByExternalId();
    expect(result).toBe(2);
    // Should delete IDs 5 and 3 (keeping 10)
    expect(mockQuery).toHaveBeenCalledWith(
      'DELETE FROM advisories WHERE id IN (?)',
      [[5, 3]]
    );
  });

  test('should handle multiple duplicate groups', async () => {
    mockQuery
      .mockResolvedValueOnce([[
        { external_id: 'abc', site_id: 1, ids: '10,5', count: 2 },
        { external_id: 'def', site_id: 2, ids: '20,15,8', count: 3 }
      ]])
      .mockResolvedValueOnce([{ affectedRows: 3 }]);

    const result = await removeDuplicatesByExternalId();
    expect(result).toBe(3);
    // Should delete IDs 5, 15, 8 (keeping 10, 20)
    expect(mockQuery).toHaveBeenCalledWith(
      'DELETE FROM advisories WHERE id IN (?)',
      [[5, 15, 8]]
    );
  });
});

describe('removeDuplicatesByVTECEventId', () => {
  test('should return 0 when no duplicates found', async () => {
    mockQuery.mockResolvedValueOnce([[]]);

    const result = await removeDuplicatesByVTECEventId();
    expect(result).toBe(0);
  });

  test('should remove duplicates keeping highest priority action', async () => {
    // CON has priority 1, NEW has priority 7 — CON should be kept
    mockQuery
      .mockResolvedValueOnce([[
        { vtec_event_id: 'KLOT.WS.W.0003', site_id: 1, advisory_type: 'Winter Storm Warning', ids: '20,15', count: 2 }
      ]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    const result = await removeDuplicatesByVTECEventId();
    expect(result).toBe(1);
  });
});

describe('removeDuplicatesByVTECCode', () => {
  test('should return 0 when no duplicates found', async () => {
    mockQuery.mockResolvedValueOnce([[]]);

    const result = await removeDuplicatesByVTECCode();
    expect(result).toBe(0);
  });

  test('should remove duplicates keeping most recently updated', async () => {
    mockQuery
      .mockResolvedValueOnce([[
        { vtec_code: '/O.CON.KLOT.WS.W.0003/', site_id: 1, advisory_type: 'Winter Storm Warning', ids: '25,20', count: 2 }
      ]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    const result = await removeDuplicatesByVTECCode();
    expect(result).toBe(1);
  });
});

describe('removeDuplicateTypes', () => {
  test('should return 0 when no duplicate types found', async () => {
    mockQuery.mockResolvedValueOnce([[]]);

    const result = await removeDuplicateTypes();
    expect(result).toBe(0);
  });

  test('should keep highest severity advisory for each type per site', async () => {
    mockQuery
      .mockResolvedValueOnce([[
        { site_id: 1, advisory_type: 'Wind Advisory', ids: '30,25,20', count: 3 }
      ]])
      .mockResolvedValueOnce([{ affectedRows: 2 }]);

    const result = await removeDuplicateTypes();
    expect(result).toBe(2);
    expect(mockQuery).toHaveBeenCalledWith(
      'DELETE FROM advisories WHERE id IN (?)',
      [[25, 20]]
    );
  });
});

describe('markExpiredByEndTime', () => {
  test('should return count of marked advisories', async () => {
    mockQuery.mockResolvedValueOnce([{ affectedRows: 5 }]);

    const result = await markExpiredByEndTime();
    expect(result).toBe(5);
  });

  test('should return 0 when nothing to mark', async () => {
    mockQuery.mockResolvedValueOnce([{ affectedRows: 0 }]);

    const result = await markExpiredByEndTime();
    expect(result).toBe(0);
  });
});

describe('removeExpiredAdvisories', () => {
  test('should return 0 when no expired advisories exist', async () => {
    // markExpiredByEndTime
    mockQuery.mockResolvedValueOnce([{ affectedRows: 0 }]);
    // SELECT expired IDs
    mockQuery.mockResolvedValueOnce([[]]);

    const result = await removeExpiredAdvisories();
    expect(result).toBe(0);
  });

  test('should delete expired advisories in batches', async () => {
    // markExpiredByEndTime
    mockQuery.mockResolvedValueOnce([{ affectedRows: 3 }]);
    // SELECT expired IDs
    mockQuery.mockResolvedValueOnce([[{ id: 1 }, { id: 2 }, { id: 3 }]]);
    // batchDelete
    mockQuery.mockResolvedValueOnce([{ affectedRows: 3 }]);

    const result = await removeExpiredAdvisories();
    expect(result).toBe(3);
  });
});

describe('checkSchema', () => {
  test('should return true when all required columns exist', async () => {
    mockQuery.mockResolvedValueOnce([[
      { COLUMN_NAME: 'id' },
      { COLUMN_NAME: 'external_id' },
      { COLUMN_NAME: 'vtec_code' },
      { COLUMN_NAME: 'vtec_event_id' },
      { COLUMN_NAME: 'vtec_action' },
      { COLUMN_NAME: 'site_id' },
      { COLUMN_NAME: 'status' }
    ]]);

    const result = await checkSchema();
    expect(result).toBe(true);
  });

  test('should return false when columns are missing', async () => {
    mockQuery.mockResolvedValueOnce([[
      { COLUMN_NAME: 'id' },
      { COLUMN_NAME: 'site_id' }
      // Missing: external_id, vtec_code, vtec_event_id, vtec_action
    ]]);

    const result = await checkSchema();
    expect(result).toBe(false);
  });
});

describe('runCleanup', () => {
  test('should run full cleanup mode', async () => {
    // checkSchema
    mockQuery.mockResolvedValueOnce([[
      { COLUMN_NAME: 'external_id' },
      { COLUMN_NAME: 'vtec_code' },
      { COLUMN_NAME: 'vtec_event_id' },
      { COLUMN_NAME: 'vtec_action' }
    ]]);
    // populateExternalIds - no advisories to process
    mockQuery.mockResolvedValueOnce([[]]);
    // removeDuplicatesByExternalId - no duplicates
    mockQuery.mockResolvedValueOnce([[]]);
    // removeDuplicatesByVTECEventId - no duplicates
    mockQuery.mockResolvedValueOnce([[]]);
    // removeDuplicatesByVTECCode - no duplicates
    mockQuery.mockResolvedValueOnce([[]]);
    // removeDuplicateTypes - no duplicates
    mockQuery.mockResolvedValueOnce([[]]);
    // markExpiredByEndTime
    mockQuery.mockResolvedValueOnce([{ affectedRows: 0 }]);
    // removeExpiredAdvisories - SELECT expired
    mockQuery.mockResolvedValueOnce([[]]);

    const result = await runCleanup('full', { exitOnComplete: false, silent: true });
    expect(result.success).toBe(true);
    expect(result.mode).toBe('full');
    expect(result.totalRemoved).toBe(0);
  });

  test('should run expired-only mode', async () => {
    // checkSchema
    mockQuery.mockResolvedValueOnce([[
      { COLUMN_NAME: 'external_id' },
      { COLUMN_NAME: 'vtec_code' },
      { COLUMN_NAME: 'vtec_event_id' },
      { COLUMN_NAME: 'vtec_action' }
    ]]);
    // markExpiredByEndTime
    mockQuery.mockResolvedValueOnce([{ affectedRows: 2 }]);
    // SELECT expired IDs
    mockQuery.mockResolvedValueOnce([[{ id: 100 }, { id: 101 }]]);
    // batchDelete
    mockQuery.mockResolvedValueOnce([{ affectedRows: 2 }]);

    const result = await runCleanup('expired', { exitOnComplete: false, silent: true });
    expect(result.success).toBe(true);
    expect(result.mode).toBe('expired');
    expect(result.expiredRemoved).toBe(2);
    expect(result.totalRemoved).toBe(2);
  });

  test('should run duplicates-only mode', async () => {
    // checkSchema
    mockQuery.mockResolvedValueOnce([[
      { COLUMN_NAME: 'external_id' },
      { COLUMN_NAME: 'vtec_code' },
      { COLUMN_NAME: 'vtec_event_id' },
      { COLUMN_NAME: 'vtec_action' }
    ]]);
    // removeDuplicatesByExternalId - no duplicates
    mockQuery.mockResolvedValueOnce([[]]);
    // removeDuplicatesByVTECEventId - no duplicates
    mockQuery.mockResolvedValueOnce([[]]);
    // removeDuplicatesByVTECCode - no duplicates
    mockQuery.mockResolvedValueOnce([[]]);
    // removeDuplicateTypes - no duplicates
    mockQuery.mockResolvedValueOnce([[]]);

    const result = await runCleanup('duplicates', { exitOnComplete: false, silent: true });
    expect(result.success).toBe(true);
    expect(result.mode).toBe('duplicates');
  });

  test('should handle unknown mode gracefully', async () => {
    // checkSchema
    mockQuery.mockResolvedValueOnce([[
      { COLUMN_NAME: 'external_id' },
      { COLUMN_NAME: 'vtec_code' },
      { COLUMN_NAME: 'vtec_event_id' },
      { COLUMN_NAME: 'vtec_action' }
    ]]);

    const result = await runCleanup('invalid_mode', { exitOnComplete: false, silent: true });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown cleanup mode');
  });

  test('should set error state on database failure', async () => {
    // checkSchema throws
    mockQuery.mockRejectedValueOnce(new Error('Connection refused'));

    const result = await runCleanup('full', { exitOnComplete: false, silent: true });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Connection refused');
  });

  test('should include start and end timestamps on success', async () => {
    // checkSchema
    mockQuery.mockResolvedValueOnce([[
      { COLUMN_NAME: 'external_id' },
      { COLUMN_NAME: 'vtec_code' },
      { COLUMN_NAME: 'vtec_event_id' },
      { COLUMN_NAME: 'vtec_action' }
    ]]);
    // All cleanup steps return empty
    mockQuery.mockResolvedValue([[]]);

    const result = await runCleanup('vtec', { exitOnComplete: false, silent: true });
    expect(result.startTime).toBeDefined();
    expect(result.endTime).toBeDefined();
  });
});
