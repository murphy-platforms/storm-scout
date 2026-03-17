'use strict';

/**
 * Unit tests for src/config/database.js
 *
 * Every test resets modules so the module-level `let pool = null` is fresh.
 * mysql2/promise, fs, and config are all mocked.
 */

// ---------------------------------------------------------------------------
// Shared mock factories (called inside each test / beforeEach after resetModules)
// ---------------------------------------------------------------------------

function makeMockPool() {
    const mockConnection = {
        query: jest.fn().mockResolvedValue([[]]),
        release: jest.fn()
    };
    return {
        query: jest.fn().mockResolvedValue([[]]),
        getConnection: jest.fn().mockResolvedValue(mockConnection),
        end: jest.fn().mockResolvedValue(),
        on: jest.fn(),
        _mockConnection: mockConnection // handy ref for assertions
    };
}

function setupMocks(overrides = {}) {
    const mockPool = overrides.pool || makeMockPool();

    jest.doMock('mysql2/promise', () => ({
        createPool: jest.fn(() => mockPool)
    }));

    jest.doMock('fs', () => ({
        existsSync: overrides.existsSync || jest.fn(() => true),
        readFileSync: overrides.readFileSync || jest.fn(() => 'CREATE TABLE t (id INT);')
    }));

    jest.doMock('../../src/config/config', () => ({
        database: {
            host: 'localhost',
            port: 3306,
            user: 'root',
            password: 'secret',
            database: 'storm_scout_test',
            ssl: false
        }
    }));

    return mockPool;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
});

// ---- initDatabase ---------------------------------------------------------

describe('initDatabase', () => {
    test('creates a pool and tests the connection', async () => {
        const mockPool = setupMocks();
        const { initDatabase } = require('../../src/config/database');

        const result = await initDatabase();

        const mysql = require('mysql2/promise');
        expect(mysql.createPool).toHaveBeenCalledTimes(1);
        // Pool should register an 'acquire' listener
        expect(mockPool.on).toHaveBeenCalledWith('acquire', expect.any(Function));
        // Should test connection via getConnection + release
        expect(mockPool.getConnection).toHaveBeenCalled();
        expect(mockPool._mockConnection.release).toHaveBeenCalled();
        expect(result).toBe(mockPool);
    });

    test('returns existing pool when called twice (memoization)', async () => {
        const mockPool = setupMocks();
        const { initDatabase } = require('../../src/config/database');

        const first = await initDatabase();
        const second = await initDatabase();

        const mysql = require('mysql2/promise');
        expect(mysql.createPool).toHaveBeenCalledTimes(1);
        expect(first).toBe(second);
    });

    test('uses DB_POOL_LIMIT env var', async () => {
        process.env.DB_POOL_LIMIT = '10';
        const mockPool = setupMocks();
        const { initDatabase } = require('../../src/config/database');

        await initDatabase();

        const mysql = require('mysql2/promise');
        const opts = mysql.createPool.mock.calls[0][0];
        expect(opts.connectionLimit).toBe(10);
        delete process.env.DB_POOL_LIMIT;
    });

    test('uses DB_STATEMENT_TIMEOUT_SECONDS env var', async () => {
        process.env.DB_STATEMENT_TIMEOUT_SECONDS = '5';
        const mockPool = setupMocks();
        const { initDatabase } = require('../../src/config/database');

        await initDatabase();

        // Simulate acquiring a connection — fire the 'acquire' callback
        const acquireCallback = mockPool.on.mock.calls.find(([ev]) => ev === 'acquire')[1];
        const fakeConn = { query: jest.fn((sql, cb) => cb(null)) };
        acquireCallback(fakeConn);

        expect(fakeConn.query).toHaveBeenCalledWith(
            'SET SESSION max_statement_time = 5',
            expect.any(Function)
        );
        delete process.env.DB_STATEMENT_TIMEOUT_SECONDS;
    });

    test('acquire callback handles SET SESSION error gracefully', async () => {
        const mockPool = setupMocks();
        const { initDatabase } = require('../../src/config/database');

        await initDatabase();

        const acquireCallback = mockPool.on.mock.calls.find(([ev]) => ev === 'acquire')[1];
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        const fakeConn = { query: jest.fn((sql, cb) => cb(new Error('unsupported'))) };
        acquireCallback(fakeConn);

        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Could not set max_statement_time'));
        warnSpy.mockRestore();
    });

    test('enables SSL when config.database.ssl is true', async () => {
        const mockPool = makeMockPool();
        jest.doMock('mysql2/promise', () => ({
            createPool: jest.fn(() => mockPool)
        }));
        jest.doMock('fs', () => ({
            existsSync: jest.fn(() => true),
            readFileSync: jest.fn(() => '')
        }));
        jest.doMock('../../src/config/config', () => ({
            database: {
                host: 'remote-host',
                port: 3306,
                user: 'root',
                password: 'pw',
                database: 'db',
                ssl: true
            }
        }));

        const { initDatabase } = require('../../src/config/database');
        await initDatabase();

        const mysql = require('mysql2/promise');
        const opts = mysql.createPool.mock.calls[0][0];
        expect(opts.ssl).toEqual({ rejectUnauthorized: true });
    });
});

// ---- getDatabase ----------------------------------------------------------

describe('getDatabase', () => {
    test('throws when pool is not initialized', () => {
        setupMocks();
        const { getDatabase } = require('../../src/config/database');
        expect(() => getDatabase()).toThrow('Database not initialized');
    });

    test('returns pool after initDatabase', async () => {
        const mockPool = setupMocks();
        const { initDatabase, getDatabase } = require('../../src/config/database');

        await initDatabase();
        expect(getDatabase()).toBe(mockPool);
    });
});

// ---- initializeSchema -----------------------------------------------------

describe('initializeSchema', () => {
    test('reads schema file and executes statements', async () => {
        const mockPool = makeMockPool();
        const readFileSync = jest.fn(() => 'CREATE TABLE a (id INT);\n-- comment\nCREATE TABLE b (id INT);');
        setupMocks({ pool: mockPool, readFileSync });

        const { initDatabase, initializeSchema } = require('../../src/config/database');
        await initDatabase();
        await initializeSchema();

        // Should have executed 2 statements
        expect(mockPool._mockConnection.query).toHaveBeenCalledTimes(2);
        expect(mockPool._mockConnection.release).toHaveBeenCalled();
    });

    test('throws when schema file is missing', async () => {
        const mockPool = makeMockPool();
        const existsSync = jest.fn(() => false);
        setupMocks({ pool: mockPool, existsSync });

        const { initDatabase, initializeSchema } = require('../../src/config/database');
        await initDatabase();

        // existsSync returns false for all paths now, but initDatabase already ran,
        // so we need a targeted mock: existsSync should return false for schema path
        await expect(initializeSchema()).rejects.toThrow('Schema file not found');
    });

    test('releases connection even when query fails', async () => {
        const mockPool = makeMockPool();
        mockPool._mockConnection.query.mockRejectedValue(new Error('syntax error'));
        setupMocks({ pool: mockPool });

        const { initDatabase, initializeSchema } = require('../../src/config/database');
        await initDatabase();

        await expect(initializeSchema()).rejects.toThrow('syntax error');
        expect(mockPool._mockConnection.release).toHaveBeenCalled();
    });
});

// ---- loadOffices ----------------------------------------------------------

describe('loadOffices', () => {
    test('inserts offices from JSON file', async () => {
        const mockPool = makeMockPool();
        const offices = [
            { office_code: 'MIA', name: 'Miami', city: 'Miami', state: 'FL', latitude: 25.7, longitude: -80.1 },
            { office_code: 'TBW', name: 'Tampa Bay', city: 'Tampa', state: 'FL', latitude: 27.9, longitude: -82.5 }
        ];
        const readFileSync = jest.fn((p) => {
            if (p.includes('offices.json')) return JSON.stringify(offices);
            return '';
        });
        setupMocks({ pool: mockPool, readFileSync });

        const { initDatabase, loadOffices } = require('../../src/config/database');
        await initDatabase();
        await loadOffices();

        // One query per office
        expect(mockPool.query).toHaveBeenCalledTimes(2);
    });

    test('throws when offices file is missing', async () => {
        const mockPool = makeMockPool();
        // existsSync: true for schema (initDatabase), false for offices.json
        let callCount = 0;
        const existsSync = jest.fn(() => {
            callCount++;
            return callCount <= 1; // first call (initDatabase path check won't happen since pool is mocked)
        });
        setupMocks({ pool: mockPool, existsSync: jest.fn(() => false) });

        const { initDatabase, loadOffices } = require('../../src/config/database');
        await initDatabase();

        await expect(loadOffices()).rejects.toThrow('Offices file not found');
    });

    test('passes observation_station in INSERT params', async () => {
        const mockPool = makeMockPool();
        const offices = [
            { office_code: 'MIA', name: 'Miami', city: 'Miami', state: 'FL', latitude: 25.7, longitude: -80.1, observation_station: 'KMIA' }
        ];
        const readFileSync = jest.fn((p) => {
            if (p.includes('offices.json')) return JSON.stringify(offices);
            return '';
        });
        setupMocks({ pool: mockPool, readFileSync });

        const { initDatabase, loadOffices } = require('../../src/config/database');
        await initDatabase();
        await loadOffices();

        const params = mockPool.query.mock.calls[0][1];
        expect(params).toContain('KMIA');
    });
});

// ---- seedDatabase ---------------------------------------------------------

describe('seedDatabase', () => {
    test('skips seeding when seed file does not exist', async () => {
        const mockPool = makeMockPool();
        const existsSync = jest.fn((p) => !p.includes('seed.sql'));
        setupMocks({ pool: mockPool, existsSync });

        const { initDatabase, seedDatabase } = require('../../src/config/database');
        await initDatabase();

        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        await seedDatabase();

        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Seed file not found'));
        warnSpy.mockRestore();
    });

    test('executes seed statements when file exists', async () => {
        const mockPool = makeMockPool();
        const readFileSync = jest.fn(() => "INSERT INTO t VALUES (1);\n-- comment\nINSERT INTO t VALUES (2);");
        setupMocks({ pool: mockPool, readFileSync });

        const { initDatabase, seedDatabase } = require('../../src/config/database');
        await initDatabase();

        // getConnection is called once for initializeSchema/seedDatabase
        // but since initDatabase already used it, reset count
        mockPool._mockConnection.query.mockClear();

        await seedDatabase();

        expect(mockPool._mockConnection.query).toHaveBeenCalledTimes(2);
        expect(mockPool._mockConnection.release).toHaveBeenCalled();
    });

    test('releases connection even when seed query fails', async () => {
        const mockPool = makeMockPool();
        mockPool._mockConnection.query.mockRejectedValue(new Error('duplicate key'));
        setupMocks({ pool: mockPool });

        const { initDatabase, seedDatabase } = require('../../src/config/database');
        await initDatabase();

        await expect(seedDatabase()).rejects.toThrow('duplicate key');
        expect(mockPool._mockConnection.release).toHaveBeenCalled();
    });
});

// ---- closeDatabase --------------------------------------------------------

describe('closeDatabase', () => {
    test('calls pool.end() and nullifies pool', async () => {
        const mockPool = setupMocks();
        const { initDatabase, closeDatabase, getDatabase } = require('../../src/config/database');

        await initDatabase();
        await closeDatabase();

        expect(mockPool.end).toHaveBeenCalled();
        expect(() => getDatabase()).toThrow('Database not initialized');
    });

    test('is a no-op when pool is already null', async () => {
        setupMocks();
        const { closeDatabase } = require('../../src/config/database');

        // Should not throw
        await closeDatabase();
    });
});

// ---- withRetry ------------------------------------------------------------

describe('withRetry', () => {
    test('returns result on first success', async () => {
        setupMocks();
        const { withRetry } = require('../../src/config/database');

        const result = await withRetry(() => Promise.resolve('ok'), 'test op');
        expect(result).toBe('ok');
    });

    test('retries on retryable error codes', async () => {
        jest.useFakeTimers();
        setupMocks();
        const { withRetry } = require('../../src/config/database');

        let attempt = 0;
        const op = () => {
            attempt++;
            if (attempt < 3) {
                const err = new Error('connection refused');
                err.code = 'ECONNREFUSED';
                return Promise.reject(err);
            }
            return Promise.resolve('recovered');
        };

        jest.spyOn(console, 'warn').mockImplementation(() => {});
        const promise = withRetry(op, 'retry test');
        // Advance timers for each retry sleep
        await jest.advanceTimersByTimeAsync(15000);
        const result = await promise;
        expect(result).toBe('recovered');
        expect(attempt).toBe(3);
        jest.useRealTimers();
    });

    test('throws immediately for non-retryable errors', async () => {
        setupMocks();
        const { withRetry } = require('../../src/config/database');

        const err = new Error('access denied');
        err.code = 'ER_ACCESS_DENIED_ERROR';

        await expect(withRetry(() => Promise.reject(err), 'auth test')).rejects.toThrow('access denied');
    });

    test('throws after max retries for retryable errors', async () => {
        jest.useFakeTimers();
        setupMocks();
        const { withRetry } = require('../../src/config/database');

        const err = new Error('connection timed out');
        err.code = 'ETIMEDOUT';

        jest.spyOn(console, 'warn').mockImplementation(() => {});
        let caughtError;
        const promise = withRetry(() => Promise.reject(err), 'timed-out test').catch((e) => {
            caughtError = e;
        });
        await jest.advanceTimersByTimeAsync(15000);
        await promise;
        expect(caughtError).toBeDefined();
        expect(caughtError.message).toBe('connection timed out');
        jest.useRealTimers();
    });

    test('sets isPoolExhausted flag on pool-full errors', async () => {
        setupMocks();
        const { withRetry } = require('../../src/config/database');

        const err = new Error('Pool is full');

        try {
            await withRetry(() => Promise.reject(err), 'pool test');
        } catch (e) {
            expect(e.isPoolExhausted).toBe(true);
        }
    });

    test('sets isPoolExhausted for "No connections available"', async () => {
        setupMocks();
        const { withRetry } = require('../../src/config/database');

        const err = new Error('No connections available');

        try {
            await withRetry(() => Promise.reject(err), 'pool test');
        } catch (e) {
            expect(e.isPoolExhausted).toBe(true);
        }
    });
});
