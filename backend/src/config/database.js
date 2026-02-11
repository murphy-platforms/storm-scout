/**
 * Database Connection Module using MySQL/MariaDB
 * Manages MySQL connection pool
 */

const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');
const config = require('./config');

let pool = null;

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
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
  });

  console.log(`✓ MySQL pool created: ${config.database.database}@${config.database.host}`);
  
  return pool;
}

/**
 * Get database connection from pool
 * @returns {Promise<Connection>} MySQL connection
 */
async function getDatabase() {
  if (!pool) {
    await initDatabase();
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
  
  // Split by semicolons and execute each statement
  const statements = schema
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));
  
  for (const statement of statements) {
    await db.query(statement);
  }
  
  console.log('✓ Database schema initialized');
}

/**
 * Load sites from JSON file into database
 */
async function loadSites() {
  const db = await getDatabase();
  const sitesPath = path.join(__dirname, '../data/sites.json');
  
  if (!fs.existsSync(sitesPath)) {
    throw new Error('Sites file not found: ' + sitesPath);
  }
  
  const sitesData = JSON.parse(fs.readFileSync(sitesPath, 'utf8'));
  
  const sql = `
    INSERT IGNORE INTO sites (site_code, name, city, state, latitude, longitude, region)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  
  for (const site of sitesData) {
    await db.query(sql, [
      site.site_code,
      site.name,
      site.city,
      site.state,
      site.latitude,
      site.longitude,
      site.region
    ]);
  }
  
  console.log(`✓ Loaded ${sitesData.length} sites into database`);
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
  
  // Split by semicolons and execute each statement
  const statements = seedData
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));
  
  for (const statement of statements) {
    await db.query(statement);
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
  loadSites,
  seedDatabase,
  closeDatabase
};
