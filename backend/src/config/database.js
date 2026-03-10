/**
 * Database Connection Module using MySQL/MariaDB
 * Manages MySQL connection pool with retry logic and proper configuration
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
  return new Promise(resolve => setTimeout(resolve, ms));
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
      if (
        error.message?.includes('Pool is full') ||
        error.message?.includes('No connections available')
      ) {
        error.isPoolExhausted = true;
      }

      const isRetryable = RETRY_CONFIG.retryableCodes.some(code =>
        error.code === code || error.message?.includes(code)
      );
      
      if (!isRetryable || attempt === RETRY_CONFIG.maxRetries) {
        throw error;
      }
      
      console.warn(`${operationName} failed (attempt ${attempt}/${RETRY_CONFIG.maxRetries}): ${error.message}. Retrying in ${delay}ms...`);
      await sleep(delay);
      delay = Math.min(delay * 2, RETRY_CONFIG.maxDelayMs);
    }
  }
  
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
    waitForConnections: true,
    connectionLimit: parseInt(process.env.DB_POOL_LIMIT) || 40,  // Configurable; verify MariaDB max_connections before raising
    queueLimit: 100,                // Prevent runaway queue
    // acquireTimeout is not a valid mysql2 option (it is a mysql v1 option and is silently ignored)
    connectTimeout: 10000,          // 10s timeout for initial TCP connection
    enableKeepAlive: true,
    keepAliveInitialDelay: 30000    // 30s keepalive (was 0)
  });

  // Test the connection
  await withRetry(async () => {
    const connection = await pool.getConnection();
    connection.release();
  }, 'Initial database connection');

  console.log(`✓ MySQL pool created: ${config.database.database}@${config.database.host}`);
  
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
    .filter(line => !line.trim().startsWith('--'))
    .join('\n');
  
  const statements = cleanedSchema
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);
  
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
    INSERT IGNORE INTO offices (office_code, name, city, state, latitude, longitude, region, county, ugc_codes, cwa)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      office.cwa || null
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
    .filter(line => !line.trim().startsWith('--'))
    .join('\n');
  
  const statements = cleanedData
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);
  
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
