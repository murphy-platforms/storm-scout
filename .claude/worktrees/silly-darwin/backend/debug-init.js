const db = require('./src/config/database');
const fs = require('fs');
const path = require('path');

(async () => {
  try {
    console.log('1. Initializing database connection...');
    await db.initDatabase();
    
    console.log('2. Getting connection from pool...');
    const pool = await db.getDatabase();
    const conn = await pool.getConnection();
    
    console.log('3. Reading schema file...');
    const schema = fs.readFileSync(path.join(__dirname, 'src/data/schema.sql'), 'utf8');
    
    console.log('4. Removing comments and splitting statements...');
    const cleanedSchema = schema
      .split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n');
    
    const statements = cleanedSchema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    console.log(`5. Found ${statements.length} statements to execute`);
    
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      const preview = stmt.substring(0, 60).replace(/\n/g, ' ');
      console.log(`\n   [${i+1}/${statements.length}] ${preview}...`);
      try {
        await conn.query(stmt);
        console.log('   ✓ Success');
      } catch (e) {
        console.error(`   ✗ Error: ${e.message}`);
        console.error(`   SQL: ${stmt.substring(0, 200)}`);
      }
    }
    
    console.log('\n6. Releasing connection...');
    conn.release();
    
    console.log('7. Loading sites...');
    await db.loadSites();
    
    console.log('\n8. Closing database...');
    await db.closeDatabase();
    
    console.log('\n✓ Database initialization complete!');
    
  } catch(e) {
    console.error('\n✗ Fatal error:', e.message);
    console.error(e.stack);
    process.exit(1);
  }
})();
