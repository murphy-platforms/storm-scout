/**
 * Database Connection Module using MySQL/MariaDB
 * Manages MySQL connection pool with retry logic and proper configuration
 *
 * @generated AI-authored (Claude, Warp) — vanilla JS by design
 */

const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');
const config = require('./config');

let pool = null;

// Retry configuration for transient failures
const RETRY_CONFIG = {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    retryableCodes: ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'ER_CON_COUNT_ERROR']
};

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a database operation with retry logic
 * @param {Function} operation - Async function to execute
 * @param {string} operationName - Name for logging
 * @returns {Promise<any>} Result of the operation
 */
async function withRetry(operation, operationName = 'Database operation') {
    let lastError;
    let delay = RETRY_CONFIG.initialDelayMs;

    for (let attempt = 1; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;

            // Flag pool exhaustion so callers and the central error handler can
            // return HTTP 503 instead of a generic 500.
            if (error.message?.includes('Pool is full') || error.message?.includes('No connections available')) {
                error.isPoolExhausted = true;
            }

            const isRetryable = RETRY_CONFIG.retryableCodes.some(
                (code) => error.code === code || error.message?.includes(code)
            );

            if (!isRetryable || attempt === RETRY_CONFIG.maxRetries) {
                throw error;
            }

            console.warn(
                `${operationName} failed (attempt ${attempt}/${RETRY_CONFIG.maxRetries}): ${error.message}. Retrying in ${delay}ms...`
            );
            await sleep(delay);
            delay = Math.min(delay * 2, RETRY_CONFIG.maxDelayMs);
        }
    }

    /* istanbul ignore next -- defensive guard; loop always throws on final attempt */
    throw lastError;
}

/**
 * Initialize MySQL connection pool
 * @returns {Promise<Pool>} MySQL connection pool
 */
async function initDatabase() {
    if (pool) {
        return pool;
    }

    pool = mysql.createPool({
        host: config.database.host,
        port: config.database.port || 3306,
        user: config.database.user,
        password: config.database.password,
        database: config.database.database,
        // SSL: enabled when DB_SSL=true (required for TCP connections not on localhost).
        // rejectUnauthorized:true verifies the server certificate — prevents MITM.
        // Set DB_SSL=false (default) for localhost/Unix socket deployments. (closes #97)
        ssl: config.database.ssl ? { rejectUnauthorized: true } : false,
        waitForConnections: true,
        // Default of 40 balances connection overhead vs. parallelism for 300 offices.
        // Review against MariaDB `SHOW VARIABLES LIKE 'max_connections'` before scaling
        // beyond 300 offices — each pool connection holds a server-side thread.
        // See ARCHITECTURE.md for scale thresholds. Configurable via DB_POOL_LIMIT env var.
        connectionLimit: parseInt(process.env.DB_POOL_LIMIT) || 40,
        queueLimit: 100, // Prevent runaway queue
        // acquireTimeout is not a valid mysql2 option (it is a mysql v1 option and is silently ignored)
        connectTimeout: 10000, // 10s timeout for initial TCP connection
        enableKeepAlive: true,
        keepAliveInitialDelay: 30000 // 30s keepalive (was 0)
    });

    // Per-statement timeout: set max_statement_time on every acquired connection.
    // mysql2 v3.x has no pool-level queryTimeout option; the session variable is the
    // correct mechanism for MariaDB. Falls back gracefully on MySQL < 5.7. (closes #113)
    //
    // 30s covers worst-case Haversine geo queries and full history scans across 30 days
    // of advisory_history. Lower to 10s once query performance is profiled in production
    // and slow queries are indexed. Configurable via DB_STATEMENT_TIMEOUT_SECONDS env var.
    const statementTimeoutSec = parseInt(process.env.DB_STATEMENT_TIMEOUT_SECONDS) || 30;
    pool.on('acquire', (connection) => {
        connection.query(`SET SESSION max_statement_time = ${statementTimeoutSec}`, (err) => {
            if (err) {
                console.warn(`[DB] Could not set max_statement_time (${err.message}) — skipping statement timeout`);
            }
        });
    });

    // Test the connection
    await withRetry(async () => {
        const connection = await pool.getConnection();
        connection.release();
    }, 'Initial database connection');

    console.log(
        `✓ MySQL pool created: ${config.database.database}@${config.database.host} (statement timeout: ${statementTimeoutSec}s)`
    );

    return pool;
}

/**
 * Get database connection from pool
 * @returns {Pool} MySQL connection pool
 */
function getDatabase() {
    if (!pool) {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }
    return pool;
}

/**
 * Initialize database schema
 */
async function initializeSchema() {
    const db = await getDatabase();
    const schemaPath = path.join(__dirname, '../data/schema.sql');

    if (!fs.existsSync(schemaPath)) {
        throw new Error('Schema file not found: ' + schemaPath);
    }

    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Remove comment lines and split by semicolons
    const cleanedSchema = schema
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n');

    const statements = cleanedSchema
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

    const connection = await db.getConnection();
    try {
        for (const statement of statements) {
            await connection.query(statement);
        }
    } finally {
        connection.release();
    }

    console.log('✓ Database schema initialized');
}

/**
 * Load offices from JSON file into database
 */
async function loadOffices() {
    const db = await getDatabase();
    const officesPath = path.join(__dirname, '../data/offices.json');

    if (!fs.existsSync(officesPath)) {
        throw new Error('Offices file not found: ' + officesPath);
    }

    const officesData = JSON.parse(fs.readFileSync(officesPath, 'utf8'));

    const sql = `
    INSERT INTO offices (office_code, name, city, state, latitude, longitude, region, county, ugc_codes, cwa, observation_station)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      city = VALUES(city),
      state = VALUES(state),
      latitude = VALUES(latitude),
      longitude = VALUES(longitude),
      region = VALUES(region),
      county = VALUES(county),
      ugc_codes = VALUES(ugc_codes),
      cwa = VALUES(cwa),
      observation_station = VALUES(observation_station)
  `;

    for (const office of officesData) {
        await db.query(sql, [
            office.office_code,
            office.name,
            office.city,
            office.state,
            office.latitude,
            office.longitude,
            office.region || null,
            office.county || null,
            office.ugc_codes || null,
            office.cwa || null,
            office.observation_station || null
        ]);
    }

    console.log(`✓ Loaded ${officesData.length} offices into database`);
}

/**
 * Seed database with sample data
 */
async function seedDatabase() {
    const db = await getDatabase();
    const seedPath = path.join(__dirname, '../data/seed.sql');

    if (!fs.existsSync(seedPath)) {
        console.warn('Seed file not found, skipping seed data');
        return;
    }

    const seedData = fs.readFileSync(seedPath, 'utf8');

    // Remove comment lines and split by semicolons
    const cleanedData = seedData
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n');

    const statements = cleanedData
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

    const connection = await db.getConnection();
    try {
        for (const statement of statements) {
            await connection.query(statement);
        }
    } finally {
        connection.release();
    }

    console.log('✓ Database seeded with sample data');
}

/**
 * Close database connection pool
 */
async function closeDatabase() {
    if (pool) {
        await pool.end();
        pool = null;
        console.log('✓ Database pool closed');
    }
}

module.exports = {
    initDatabase,
    getDatabase,
    initializeSchema,
    loadOffices,
    seedDatabase,
    closeDatabase,
    withRetry
};
