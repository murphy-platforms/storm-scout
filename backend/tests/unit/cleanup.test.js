/**
 * Unit tests for the advisory cleanup module
 * Covers: batchDelete batching, runCleanup mode routing, error handling,
 *         and individual cleanup functions
 */

jest.mock('../../src/config/database', () => ({
    initDatabase: jest.fn().mockResolvedValue(true),
    getDatabase: jest.fn(),
    closeDatabase: jest.fn().mockResolvedValue(true)
}));

jest.mock('../../src/utils/alerting', () => ({
    alertCleanupFailure: jest.fn().mockResolvedValue(true)
}));

const { getDatabase, initDatabase, closeDatabase } = require('../../src/config/database');
const { alertCleanupFailure } = require('../../src/utils/alerting');
const {
    batchDelete,
    runCleanup,
    BATCH_SIZE,
    removeDuplicatesByExternalId,
    removeDuplicatesByVTECEventId,
    removeDuplicatesByVTECCode,
    removeDuplicateTypes,
    markExpiredByEndTime,
    removeExpiredAdvisories,
    nullifyStaleRawPayloads,
    populateExternalIds,
    checkSchema
} = require('../../src/utils/cleanup-advisories');

function createMockDb() {
    return {
        query: jest.fn().mockResolvedValue([{ affectedRows: 0 }]),
        getConnection: jest.fn()
    };
}

describe('BATCH_SIZE constant', () => {
    test('should be 1000', () => {
        expect(BATCH_SIZE).toBe(1000);
    });
});

describe('batchDelete', () => {
    let mockDb;

    beforeEach(() => {
        mockDb = createMockDb();
        getDatabase.mockReturnValue(mockDb);
    });

    test('should return 0 for empty array', async () => {
        const result = await batchDelete([]);
        expect(result).toBe(0);
        expect(mockDb.query).not.toHaveBeenCalled();
    });

    test('should delete all IDs in a single batch when under BATCH_SIZE', async () => {
        const ids = [1, 2, 3, 4, 5];
        mockDb.query.mockResolvedValue([{ affectedRows: 5 }]);

        const result = await batchDelete(ids);
        expect(result).toBe(5);
        expect(mockDb.query).toHaveBeenCalledTimes(1);
        expect(mockDb.query).toHaveBeenCalledWith(
            'DELETE FROM advisories WHERE id IN (?)',
            [ids]
        );
    });

    test('should split into multiple batches when exceeding BATCH_SIZE', async () => {
        const ids = Array.from({ length: 2500 }, (_, i) => i + 1);
        mockDb.query
            .mockResolvedValueOnce([{ affectedRows: 1000 }])
            .mockResolvedValueOnce([{ affectedRows: 1000 }])
            .mockResolvedValueOnce([{ affectedRows: 500 }]);

        const result = await batchDelete(ids);
        expect(result).toBe(2500);
        expect(mockDb.query).toHaveBeenCalledTimes(3);
    });

    test('should use custom table name', async () => {
        mockDb.query.mockResolvedValue([{ affectedRows: 1 }]);
        await batchDelete([1], 'custom_table');
        expect(mockDb.query).toHaveBeenCalledWith(
            'DELETE FROM custom_table WHERE id IN (?)',
            [[1]]
        );
    });
});

describe('removeDuplicatesByExternalId', () => {
    let mockDb;

    beforeEach(() => {
        mockDb = createMockDb();
        getDatabase.mockReturnValue(mockDb);
    });

    test('should return 0 when no duplicates found', async () => {
        mockDb.query.mockResolvedValueOnce([[]]);  // no duplicates

        const result = await removeDuplicatesByExternalId();
        expect(result).toBe(0);
    });

    test('should keep highest ID and delete rest when duplicates found', async () => {
        // First call: find duplicates
        mockDb.query.mockResolvedValueOnce([[
            { external_id: 'ext-1', office_id: 1, ids: '100,50,25', count: 3 },
            { external_id: 'ext-2', office_id: 2, ids: '200,150', count: 2 }
        ]]);
        // Second call: batchDelete
        mockDb.query.mockResolvedValueOnce([{ affectedRows: 3 }]);

        const result = await removeDuplicatesByExternalId();
        expect(result).toBe(3);
        // IDs to delete: 50,25 from first group + 150 from second group
        expect(mockDb.query).toHaveBeenCalledWith(
            'DELETE FROM advisories WHERE id IN (?)',
            [[50, 25, 150]]
        );
    });
});

describe('removeDuplicatesByVTECEventId', () => {
    let mockDb;

    beforeEach(() => {
        mockDb = createMockDb();
        getDatabase.mockReturnValue(mockDb);
    });

    test('should return 0 when no duplicates found', async () => {
        mockDb.query.mockResolvedValueOnce([[]]);

        const result = await removeDuplicatesByVTECEventId();
        expect(result).toBe(0);
    });

    test('should keep highest priority and delete rest when duplicates found', async () => {
        // First call: find duplicate groups (ordered by CON>EXT>NEW priority)
        mockDb.query.mockResolvedValueOnce([[
            { vtec_event_id: 'V1', office_id: 1, advisory_type: 'Warning', ids: '300,200,100', count: 3 }
        ]]);
        // Second call: batchDelete (delete all but first = 300 kept)
        mockDb.query.mockResolvedValueOnce([{ affectedRows: 2 }]);

        const result = await removeDuplicatesByVTECEventId();
        expect(result).toBe(2);
        expect(mockDb.query).toHaveBeenCalledWith(
            'DELETE FROM advisories WHERE id IN (?)',
            [[200, 100]]
        );
    });
});

describe('removeDuplicatesByVTECCode', () => {
    let mockDb;

    beforeEach(() => {
        mockDb = createMockDb();
        getDatabase.mockReturnValue(mockDb);
    });

    test('should return 0 when no duplicates found', async () => {
        mockDb.query.mockResolvedValueOnce([[]]);

        const result = await removeDuplicatesByVTECCode();
        expect(result).toBe(0);
    });

    test('should keep most recent and delete rest when duplicates found', async () => {
        mockDb.query.mockResolvedValueOnce([[
            { vtec_code: 'TO.W', office_id: 1, advisory_type: 'Warning', ids: '500,400', count: 2 }
        ]]);
        mockDb.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

        const result = await removeDuplicatesByVTECCode();
        expect(result).toBe(1);
        expect(mockDb.query).toHaveBeenCalledWith(
            'DELETE FROM advisories WHERE id IN (?)',
            [[400]]
        );
    });
});

describe('removeDuplicateTypes', () => {
    let mockDb;

    beforeEach(() => {
        mockDb = createMockDb();
        getDatabase.mockReturnValue(mockDb);
    });

    test('should return 0 when no duplicates found', async () => {
        mockDb.query.mockResolvedValueOnce([[]]);

        const result = await removeDuplicateTypes();
        expect(result).toBe(0);
    });

    test('should keep highest severity and delete rest when duplicates found', async () => {
        mockDb.query.mockResolvedValueOnce([[
            { office_id: 1, advisory_type: 'Tornado Warning', ids: '600,500,400', count: 3 }
        ]]);
        mockDb.query.mockResolvedValueOnce([{ affectedRows: 2 }]);

        const result = await removeDuplicateTypes();
        expect(result).toBe(2);
        expect(mockDb.query).toHaveBeenCalledWith(
            'DELETE FROM advisories WHERE id IN (?)',
            [[500, 400]]
        );
    });
});

describe('markExpiredByEndTime', () => {
    let mockDb;

    beforeEach(() => {
        mockDb = createMockDb();
        getDatabase.mockReturnValue(mockDb);
    });

    test('should return count when advisories are marked expired', async () => {
        mockDb.query.mockResolvedValueOnce([{ affectedRows: 5 }]);

        const result = await markExpiredByEndTime();
        expect(result).toBe(5);
    });

    test('should return 0 when no advisories to mark', async () => {
        mockDb.query.mockResolvedValueOnce([{ affectedRows: 0 }]);

        const result = await markExpiredByEndTime();
        expect(result).toBe(0);
    });
});

describe('nullifyStaleRawPayloads', () => {
    let mockDb;

    beforeEach(() => {
        mockDb = createMockDb();
        getDatabase.mockReturnValue(mockDb);
    });

    test('should return count when payloads are nullified', async () => {
        mockDb.query.mockResolvedValueOnce([{ affectedRows: 12 }]);

        const result = await nullifyStaleRawPayloads();
        expect(result).toBe(12);
        // Default retention is 90 days
        expect(mockDb.query).toHaveBeenCalledWith(
            expect.stringContaining('raw_payload = NULL'),
            [90]
        );
    });

    test('should return 0 when no payloads to nullify', async () => {
        mockDb.query.mockResolvedValueOnce([{ affectedRows: 0 }]);

        const result = await nullifyStaleRawPayloads();
        expect(result).toBe(0);
    });

    test('should use custom retention days', async () => {
        mockDb.query.mockResolvedValueOnce([{ affectedRows: 3 }]);

        const result = await nullifyStaleRawPayloads(30);
        expect(result).toBe(3);
        expect(mockDb.query).toHaveBeenCalledWith(
            expect.stringContaining('INTERVAL ? DAY'),
            [30]
        );
    });
});

describe('removeExpiredAdvisories', () => {
    let mockDb;

    beforeEach(() => {
        mockDb = createMockDb();
        getDatabase.mockReturnValue(mockDb);
    });

    test('should call markExpiredByEndTime first and return 0 when no expired rows', async () => {
        // First query: markExpiredByEndTime UPDATE
        mockDb.query.mockResolvedValueOnce([{ affectedRows: 0 }]);
        // Second query: SELECT expired rows
        mockDb.query.mockResolvedValueOnce([[]]);

        const result = await removeExpiredAdvisories();
        expect(result).toBe(0);
        expect(mockDb.query).toHaveBeenCalledTimes(2);
    });

    test('should batch delete expired rows when found', async () => {
        // First query: markExpiredByEndTime UPDATE
        mockDb.query.mockResolvedValueOnce([{ affectedRows: 2 }]);
        // Second query: SELECT expired rows
        mockDb.query.mockResolvedValueOnce([[{ id: 10 }, { id: 20 }, { id: 30 }]]);
        // Third query: batchDelete
        mockDb.query.mockResolvedValueOnce([{ affectedRows: 3 }]);

        const result = await removeExpiredAdvisories();
        expect(result).toBe(3);
    });
});

describe('populateExternalIds', () => {
    let mockDb;
    let mockConnection;

    beforeEach(() => {
        mockConnection = {
            query: jest.fn(),
            beginTransaction: jest.fn().mockResolvedValue(),
            commit: jest.fn().mockResolvedValue(),
            rollback: jest.fn().mockResolvedValue(),
            release: jest.fn()
        };
        mockDb = createMockDb();
        mockDb.getConnection.mockResolvedValue(mockConnection);
        getDatabase.mockReturnValue(mockDb);
    });

    test('should return 0 when no advisories without external_id', async () => {
        mockDb.query.mockResolvedValueOnce([[]]);

        const result = await populateExternalIds();
        expect(result).toBe(0);
    });

    test('should update external_id from raw_payload id field', async () => {
        // SELECT advisories without external_id
        mockDb.query.mockResolvedValueOnce([[
            { id: 1, raw_payload: JSON.stringify({ id: 'NWS-001', properties: {} }) }
        ]]);
        // Lock check: no existing row with same external_id
        mockConnection.query.mockResolvedValueOnce([[]]);
        // UPDATE external_id
        mockConnection.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

        const result = await populateExternalIds();
        expect(result).toBe(1);
        expect(mockConnection.commit).toHaveBeenCalled();
        expect(mockConnection.release).toHaveBeenCalled();
    });

    test('should delete advisory when duplicate external_id for same office', async () => {
        // SELECT advisories without external_id
        mockDb.query.mockResolvedValueOnce([[
            { id: 5, raw_payload: JSON.stringify({ id: 'NWS-DUP' }) }
        ]]);
        // Lock check: existing row found with same external_id + office_id
        mockConnection.query.mockResolvedValueOnce([[{ id: 3 }]]);
        // DELETE duplicate
        mockConnection.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

        const result = await populateExternalIds();
        expect(result).toBe(1); // 0 updated + 1 duplicate removed
        expect(mockConnection.commit).toHaveBeenCalled();
    });

    test('should handle ER_DUP_ENTRY race condition by deleting advisory', async () => {
        mockDb.query
            .mockResolvedValueOnce([[
                { id: 7, raw_payload: JSON.stringify({ id: 'NWS-RACE' }) }
            ]])
            // DELETE after race condition
            .mockResolvedValueOnce([{ affectedRows: 1 }]);

        // Lock check succeeds (no dups), then commit throws ER_DUP_ENTRY
        mockConnection.query.mockResolvedValueOnce([[]]);
        mockConnection.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
        const dupError = new Error('Duplicate entry');
        dupError.code = 'ER_DUP_ENTRY';
        mockConnection.commit.mockRejectedValueOnce(dupError);

        const result = await populateExternalIds();
        // updated++ ran before commit failed, then duplicatesRemoved++ on ER_DUP_ENTRY
        expect(result).toBe(2);
        expect(mockConnection.rollback).toHaveBeenCalled();
        expect(mockConnection.release).toHaveBeenCalled();
    });

    test('should continue on parse error', async () => {
        mockDb.query.mockResolvedValueOnce([[
            { id: 9, raw_payload: 'not valid json' }
        ]]);

        const result = await populateExternalIds();
        expect(result).toBe(0);
    });

    test('re-throws non-ER_DUP_ENTRY commit errors (line 367) and continues', async () => {
        // SELECT advisories without external_id — return one to process
        mockDb.query.mockResolvedValueOnce([[
            { id: 7, raw_payload: JSON.stringify({ id: 'NWS-007' }) }
        ]]);

        // Lock check: no existing row with same external_id
        mockConnection.query.mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE

        // Commit throws a non-ER_DUP_ENTRY error (e.g. connection reset)
        const connError = new Error('Connection reset');
        connError.code = 'ECONNRESET';
        mockConnection.commit.mockRejectedValueOnce(connError);

        // Should NOT throw — outer catch in populateExternalIds handles it
        const result = await populateExternalIds();
        expect(mockConnection.rollback).toHaveBeenCalled();
        expect(mockConnection.release).toHaveBeenCalled();
        // updated++ ran before commit failed, but result may vary
        expect(typeof result).toBe('number');
    });
});

describe('checkSchema', () => {
    let mockDb;

    beforeEach(() => {
        mockDb = createMockDb();
        getDatabase.mockReturnValue(mockDb);
    });

    test('should return true when all required columns present', async () => {
        mockDb.query.mockResolvedValueOnce([[
            { COLUMN_NAME: 'external_id' },
            { COLUMN_NAME: 'vtec_code' },
            { COLUMN_NAME: 'vtec_event_id' },
            { COLUMN_NAME: 'vtec_action' }
        ]]);

        const result = await checkSchema();
        expect(result).toBe(true);
    });

    test('should return false when columns are missing', async () => {
        mockDb.query.mockResolvedValueOnce([[
            { COLUMN_NAME: 'external_id' }
            // missing vtec_code, vtec_event_id, vtec_action
        ]]);

        const result = await checkSchema();
        expect(result).toBe(false);
    });
});

describe('runCleanup', () => {
    let mockDb;

    beforeEach(() => {
        mockDb = createMockDb();
        getDatabase.mockReturnValue(mockDb);
        initDatabase.mockResolvedValue(true);
        closeDatabase.mockResolvedValue(true);
        alertCleanupFailure.mockClear();
        jest.spyOn(process, 'exit').mockImplementation(() => {});

        // Schema check returns all required columns
        mockDb.query.mockImplementation((sql) => {
            if (sql.includes('INFORMATION_SCHEMA.COLUMNS')) {
                return [[
                    { COLUMN_NAME: 'external_id' },
                    { COLUMN_NAME: 'vtec_code' },
                    { COLUMN_NAME: 'vtec_event_id' },
                    { COLUMN_NAME: 'vtec_action' }
                ]];
            }
            // GROUP BY queries (duplicate searches) — return no duplicates
            if (sql.includes('GROUP BY')) {
                return [[]];
            }
            // SELECT id queries (expired advisory search) — return none
            if (sql.includes('SELECT id FROM')) {
                return [[]];
            }
            // SELECT with raw_payload (populateExternalIds) — return none
            if (sql.includes('raw_payload')) {
                return [[]];
            }
            // UPDATE/DELETE results
            return [{ affectedRows: 0 }];
        });
    });

    afterEach(() => {
        process.exit.mockRestore();
    });

    test('should run full cleanup mode', async () => {
        const results = await runCleanup('full', { silent: true, exitOnComplete: false });

        expect(results.mode).toBe('full');
        expect(results.success).toBe(true);
        expect(results.totalRemoved).toBe(0);
        expect(initDatabase).toHaveBeenCalled();
    });

    test('should run expired mode', async () => {
        const results = await runCleanup('expired', { silent: true, exitOnComplete: false });

        expect(results.mode).toBe('expired');
        expect(results.success).toBe(true);
    });

    test('should run vtec mode', async () => {
        const results = await runCleanup('vtec', { silent: true, exitOnComplete: false });

        expect(results.mode).toBe('vtec');
        expect(results.success).toBe(true);
    });

    test('should run event_id mode', async () => {
        const results = await runCleanup('event_id', { silent: true, exitOnComplete: false });

        expect(results.mode).toBe('event_id');
        expect(results.success).toBe(true);
    });

    test('should run duplicates mode', async () => {
        const results = await runCleanup('duplicates', { silent: true, exitOnComplete: false });

        expect(results.mode).toBe('duplicates');
        expect(results.success).toBe(true);
    });

    test('should run payloads mode', async () => {
        const results = await runCleanup('payloads', { silent: true, exitOnComplete: false });

        expect(results.mode).toBe('payloads');
        expect(results.success).toBe(true);
        expect(results.rawPayloadsNullified).toBe(0);
    });

    test('should fail with unknown mode', async () => {
        const results = await runCleanup('invalid_mode', { silent: true, exitOnComplete: false });

        expect(results.success).toBe(false);
        expect(results.error).toContain('Unknown cleanup mode');
        expect(alertCleanupFailure).toHaveBeenCalled();
    });

    test('should handle database initialization failure', async () => {
        initDatabase.mockRejectedValue(new Error('Connection failed'));

        const results = await runCleanup('full', { silent: true, exitOnComplete: false });

        expect(results.success).toBe(false);
        expect(results.error).toBe('Connection failed');
    });

    test('should call process.exit with 0 on success when exitOnComplete is true', async () => {
        await runCleanup('expired', { silent: true, exitOnComplete: true });

        expect(closeDatabase).toHaveBeenCalled();
        expect(process.exit).toHaveBeenCalledWith(0);
    });

    test('should call process.exit with 1 on failure when exitOnComplete is true', async () => {
        initDatabase.mockRejectedValue(new Error('fail'));
        await runCleanup('full', { silent: true, exitOnComplete: true });

        expect(process.exit).toHaveBeenCalledWith(1);
    });

    test('should calculate totalRemoved as sum of all removal counts', async () => {
        const results = await runCleanup('full', { silent: true, exitOnComplete: false });

        const expected =
            results.externalIdDuplicates +
            results.vtecEventIdDuplicates +
            results.vtecCodeDuplicates +
            results.typeDuplicates +
            results.expiredRemoved;
        expect(results.totalRemoved).toBe(expected);
    });

    test('should include startTime in results', async () => {
        const results = await runCleanup('full', { silent: true, exitOnComplete: false });

        expect(results.startTime).toBeDefined();
        expect(new Date(results.startTime).getTime()).not.toBeNaN();
    });

    test('logs non-zero removal counts in summary (covers conditional log lines)', async () => {
        // Override to return 1 vtec code duplicate for the 'vtec' mode run
        mockDb.query.mockImplementation((sql) => {
            if (sql.includes('INFORMATION_SCHEMA.COLUMNS')) {
                return [[
                    { COLUMN_NAME: 'external_id' },
                    { COLUMN_NAME: 'vtec_code' },
                    { COLUMN_NAME: 'vtec_event_id' },
                    { COLUMN_NAME: 'vtec_action' }
                ]];
            }
            // vtec_code duplicate found
            if (sql.includes('GROUP BY') && sql.includes('vtec_code')) {
                return [[
                    { vtec_code: 'TO.W', office_id: 1, advisory_type: 'Tornado Warning', ids: '500,400', count: 2 }
                ]];
            }
            if (sql.includes('DELETE')) {
                return [{ affectedRows: 1 }];
            }
            return [{ affectedRows: 0 }];
        });

        const results = await runCleanup('vtec', { silent: false, exitOnComplete: false });

        expect(results.vtecCodeDuplicates).toBe(1);
        expect(results.success).toBe(true);
    });

    test('logs expired removal count in summary', async () => {
        mockDb.query.mockImplementation((sql) => {
            if (sql.includes('INFORMATION_SCHEMA.COLUMNS')) {
                return [[
                    { COLUMN_NAME: 'external_id' }, { COLUMN_NAME: 'vtec_code' },
                    { COLUMN_NAME: 'vtec_event_id' }, { COLUMN_NAME: 'vtec_action' }
                ]];
            }
            if (sql.includes('UPDATE advisories')) {
                return [{ affectedRows: 3 }]; // markExpiredByEndTime
            }
            if (sql.includes('SELECT id FROM')) {
                return [[{ id: 10 }, { id: 11 }, { id: 12 }]]; // expired rows
            }
            if (sql.includes('DELETE')) {
                return [{ affectedRows: 3 }];
            }
            return [{ affectedRows: 0 }];
        });

        const results = await runCleanup('expired', { silent: false, exitOnComplete: false });

        expect(results.expiredRemoved).toBe(3);
        expect(results.success).toBe(true);
    });

    test('logs rawPayloadsNullified count in summary', async () => {
        mockDb.query.mockImplementation((sql) => {
            if (sql.includes('INFORMATION_SCHEMA.COLUMNS')) {
                return [[
                    { COLUMN_NAME: 'external_id' }, { COLUMN_NAME: 'vtec_code' },
                    { COLUMN_NAME: 'vtec_event_id' }, { COLUMN_NAME: 'vtec_action' }
                ]];
            }
            if (sql.includes('raw_payload = NULL')) {
                return [{ affectedRows: 5 }];
            }
            return [{ affectedRows: 0 }];
        });

        const results = await runCleanup('payloads', { silent: false, exitOnComplete: false });

        expect(results.rawPayloadsNullified).toBe(5);
        expect(results.success).toBe(true);
    });

    test('logs vtecEventIdDuplicates count in summary (event_id mode)', async () => {
        mockDb.query.mockImplementation((sql) => {
            if (sql.includes('INFORMATION_SCHEMA.COLUMNS')) {
                return [[
                    { COLUMN_NAME: 'external_id' }, { COLUMN_NAME: 'vtec_code' },
                    { COLUMN_NAME: 'vtec_event_id' }, { COLUMN_NAME: 'vtec_action' }
                ]];
            }
            if (sql.includes('GROUP BY') && sql.includes('vtec_event_id')) {
                return [[
                    { vtec_event_id: 'KIWX.TO.W.0001', office_id: 1, advisory_type: 'Tornado Warning', ids: '300,200,100', count: 3 }
                ]];
            }
            if (sql.includes('DELETE')) {
                return [{ affectedRows: 2 }];
            }
            return [{ affectedRows: 0 }];
        });

        const results = await runCleanup('event_id', { silent: false, exitOnComplete: false });

        expect(results.vtecEventIdDuplicates).toBe(2);
        expect(results.success).toBe(true);
    });

    test('logs externalIdDuplicates and typeDuplicates in summary (duplicates mode)', async () => {
        mockDb.query.mockImplementation((sql) => {
            if (sql.includes('INFORMATION_SCHEMA.COLUMNS')) {
                return [[
                    { COLUMN_NAME: 'external_id' }, { COLUMN_NAME: 'vtec_code' },
                    { COLUMN_NAME: 'vtec_event_id' }, { COLUMN_NAME: 'vtec_action' }
                ]];
            }
            // external_id duplicates
            if (sql.includes('GROUP BY') && sql.includes('external_id')) {
                return [[
                    { external_id: 'urn:123', office_id: 1, ids: '10,9', count: 2 }
                ]];
            }
            // vtec_event_id duplicates (return none so only external_id and type are non-zero)
            if (sql.includes('GROUP BY') && sql.includes('vtec_event_id')) {
                return [[]];
            }
            // vtec_code duplicates (return none)
            if (sql.includes('GROUP BY') && sql.includes('vtec_code')) {
                return [[]];
            }
            // type duplicates
            if (sql.includes('GROUP BY') && sql.includes('advisory_type')) {
                return [[
                    { office_id: 1, advisory_type: 'Flood Warning', ids: '20,19', count: 2 }
                ]];
            }
            if (sql.includes('DELETE')) {
                return [{ affectedRows: 1 }];
            }
            return [{ affectedRows: 0 }];
        });

        const results = await runCleanup('duplicates', { silent: false, exitOnComplete: false });

        expect(results.externalIdDuplicates).toBe(1);
        expect(results.typeDuplicates).toBe(1);
        expect(results.success).toBe(true);
    });
});
