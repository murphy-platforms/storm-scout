/**
 * Database Initialization Script
 * Run this to set up the database schema and load initial office data
 * Usage: npm run init-db
 */

const { initDatabase: initSqlJs, initializeSchema, loadOffices, closeDatabase } = require('./database');

async function initDatabase() {
  try {
    console.log('Initializing Storm Scout database...\n');

    // Initialize database connection
    await initSqlJs();

    // Initialize schema
    await initializeSchema();

    // Load office data
    await loadOffices();
    
    console.log('\n✓ Database initialization complete!');
    console.log('You can now run: npm run seed-db (optional, for sample data)');
    console.log('Then start the server: npm start');
    
  } catch (error) {
    console.error('✗ Database initialization failed:', error.message);
    process.exit(1);
  } finally {
    closeDatabase();
  }
}

initDatabase();
