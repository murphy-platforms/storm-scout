/**
 * Database Connection Module
 * Manages SQLite database connection using sql.js
 */

const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const config = require('./config');

let db = null;
let SQL = null;
let dbPath = null;

/**
 * Initialize sql.js (must be called at startup)
 */
async function initDatabase() {
  if (!SQL) {
    SQL = await initSqlJs();
  }
  return SQL;
}

/**
 * Save database to file
 */
function saveDatabase() {
  if (db && dbPath) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
}

/**
 * Initialize and return database connection
 * @returns {Object} SQLite database instance
 */
function getDatabase() {
  if (db) {
    return db;
  }

  if (!SQL) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }

  dbPath = path.resolve(__dirname, '../../', config.database.path);
  
  // Ensure directory exists
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // Load or create database
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  
  // Wrap prepare to match better-sqlite3 API
  const originalPrepare = db.prepare.bind(db);
  db.prepare = function(sql) {
    const stmt = originalPrepare(sql);
    return {
      run: function(...params) {
        stmt.bind(params);
        stmt.step();
        const rowsModified = db.getRowsModified();
        const lastId = db.exec('SELECT last_insert_rowid() as id')[0]?.values[0]?.[0] || 0;
        stmt.reset();
        // Don't save on every run - let caller save explicitly
        return { changes: rowsModified, lastInsertRowid: lastId };
      },
      get: function(...params) {
        stmt.bind(params);
        const result = stmt.step() ? stmt.getAsObject() : null;
        stmt.reset();
        return result;
      },
      all: function(...params) {
        stmt.bind(params);
        const results = [];
        while (stmt.step()) {
          results.push(stmt.getAsObject());
        }
        stmt.reset();
        return results;
      },
      free: function() {
        stmt.free();
      }
    };
  };
  
  // Enable foreign keys
  db.run('PRAGMA foreign_keys = ON');
  
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
  db.run(schema);
  saveDatabase();
  
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
  
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO sites (site_code, name, city, state, latitude, longitude, region)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  
  db.run('BEGIN TRANSACTION');
  try {
    for (const site of sitesData) {
      stmt.run(
        site.site_code,
        site.name,
        site.city,
        site.state,
        site.latitude,
        site.longitude,
        site.region
      );
    }
    db.run('COMMIT');
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  } finally {
    stmt.free();
  }
  saveDatabase();
  
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
  db.run(seedData);
  saveDatabase();
  
  console.log('✓ Database seeded with sample data');
}

/**
 * Close database connection
 */
function closeDatabase() {
  if (db) {
    saveDatabase();
    db.close();
    db = null;
    console.log('✓ Database connection closed');
  }
}

module.exports = {
  initDatabase,
  getDatabase,
  initializeSchema,
  loadSites,
  seedDatabase,
  closeDatabase,
  saveDatabase
};
