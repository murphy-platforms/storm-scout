/**
 * Database Seeding Script
 * Run this to populate the database with sample data for testing
 * Usage: npm run seed-db
 */

const { initDatabase, getDatabase, seedDatabase, closeDatabase } = require('./database');

async function seed() {
  try {
    console.log('Seeding Storm Scout database...\n');
    
    // Initialize sql.js
    await initDatabase();
    
    // Ensure database exists
    getDatabase();
    
    // Seed with sample data
    seedDatabase();
    
    console.log('\n✓ Database seeding complete!');
    console.log('Start the server: npm start');
    
  } catch (error) {
    console.error('✗ Database seeding failed:', error.message);
    process.exit(1);
  } finally {
    closeDatabase();
  }
}

seed();
