/**
 * Database Connection Module
 * Manages SQLite database connection using better-sqlite3
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const config = require('./config');

let db = null;

/**
 * Initialize and return database connection
 * @returns {Database} SQLite database instance
 */
function getDatabase() {
  if (db) {
    return db;
  }

  const dbPath = path.resolve(__dirname, '../../', config.database.path);
  
  // Ensure directory exists
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // Create/open database
  db = new Database(dbPath);
  
  // Enable foreign keys
  db.pragma('foreign_keys = ON');
  
  // Set journal mode for better concurrency
  db.pragma('journal_mode = WAL');
  
  console.log(`✓ Database connected: ${dbPath}`);
  
  return db;
}

/**
 * Initialize database schema
 */
function initializeSchema() {
  const db = getDatabase();
  const schemaPath = path.join(__dirname, '../data/schema.sql');
  
  if (!fs.existsSync(schemaPath)) {
    throw new Error('Schema file not found: ' + schemaPath);
  }
  
  const schema = fs.readFileSync(schemaPath, 'utf8');
  
  // Execute schema
  db.exec(schema);
  
  console.log('✓ Database schema initialized');
}

/**
 * Load sites from JSON file into database
 */
function loadSites() {
  const db = getDatabase();
  const sitesPath = path.join(__dirname, '../data/sites.json');
  
  if (!fs.existsSync(sitesPath)) {
    throw new Error('Sites file not found: ' + sitesPath);
  }
  
  const sitesData = JSON.parse(fs.readFileSync(sitesPath, 'utf8'));
  
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO sites (site_code, name, city, state, latitude, longitude, region)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  
  const insertMany = db.transaction((sites) => {
    for (const site of sites) {
      insertStmt.run(
        site.site_code,
        site.name,
        site.city,
        site.state,
        site.latitude,
        site.longitude,
        site.region
      );
    }
  });
  
  insertMany(sitesData);
  
  console.log(`✓ Loaded ${sitesData.length} sites into database`);
}

/**
 * Seed database with sample data
 */
function seedDatabase() {
  const db = getDatabase();
  const seedPath = path.join(__dirname, '../data/seed.sql');
  
  if (!fs.existsSync(seedPath)) {
    console.warn('Seed file not found, skipping seed data');
    return;
  }
  
  const seedData = fs.readFileSync(seedPath, 'utf8');
  db.exec(seedData);
  
  console.log('✓ Database seeded with sample data');
}

/**
 * Close database connection
 */
function closeDatabase() {
  if (db) {
    db.close();
    db = null;
    console.log('✓ Database connection closed');
  }
}

module.exports = {
  getDatabase,
  initializeSchema,
  loadSites,
  seedDatabase,
  closeDatabase
};
