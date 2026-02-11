/**
 * Database Connection Module using sql.js
 * Compatible wrapper for better-sqlite3 API
 * Works on any hosting environment (no native dependencies)
 */

const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const config = require('./config');

let db = null;
let SQL = null;

/**
 * Initialize sql.js library
 */
async function initSql() {
  if (!SQL) {
    SQL = await initSqlJs();
  }
  return SQL;
}

/**
 * Load database from file
 */
function loadDatabase(dbPath) {
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    return new SQL.Database(buffer);
  }
  return new SQL.Database();
}

/**
 * Save database to file
 */
function saveDatabase(dbPath) {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
}

/**
 * Initialize and return database connection
 * @returns {Object} SQLite database instance with better-sqlite3-like API
 */
function getDatabase() {
  if (db) {
    return db;
  }

  // Initialize synchronously (sql.js allows this after first init)
  if (!SQL) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }

  const dbPath = path.resolve(__dirname, '../../', config.database.path);
  
  // Ensure directory exists
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // Load or create database
  db = loadDatabase(dbPath);
  
  // Add compatibility methods
  db.exec = function(sql) {
    this.run(sql);
    saveDatabase(dbPath);
  };

  db.prepare = function(sql) {
    const stmt = this.prepare(sql);
    return {
      run: (...params) => {
        stmt.bind(params);
        stmt.step();
        stmt.reset();
        saveDatabase(dbPath);
        return { changes: this.getRowsModified() };
      },
      get: (...params) => {
        stmt.bind(params);
        const result = stmt.step() ? stmt.getAsObject() : null;
        stmt.reset();
        return result;
      },
      all: (...params) => {
        stmt.bind(params);
        const results = [];
        while (stmt.step()) {
          results.push(stmt.getAsObject());
        }
        stmt.reset();
        return results;
      }
    };
  };

  db.transaction = function(fn) {
    return (...args) => {
      this.run('BEGIN TRANSACTION');
      try {
        fn(...args);
        this.run('COMMIT');
        saveDatabase(dbPath);
      } catch (error) {
        this.run('ROLLBACK');
        throw error;
      }
    };
  };

  db.pragma = function(pragma) {
    this.run(`PRAGMA ${pragma}`);
  };

  db.close = function() {
    saveDatabase(dbPath);
    this.close();
  };

  // Enable foreign keys
  db.run('PRAGMA foreign_keys = ON');
  
  console.log(`✓ Database connected: ${dbPath}`);
  
  return db;
}

/**
 * Initialize database (must be called before getDatabase)
 */
async function initializeDatabase() {
  await initSql();
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
    const dbPath = path.resolve(__dirname, '../../', config.database.path);
    saveDatabase(dbPath);
    db.close();
    db = null;
    console.log('✓ Database connection closed');
  }
}

module.exports = {
  initializeDatabase,
  getDatabase,
  initializeSchema,
  loadSites,
  seedDatabase,
  closeDatabase
};
