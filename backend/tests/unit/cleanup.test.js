/**
 * Unit tests for the advisory cleanup module
 * Covers: batchDelete batching, runCleanup mode routing, error handling
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
const { batchDelete, runCleanup, BATCH_SIZE } = require('../../src/utils/cleanup-advisories');

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
});
