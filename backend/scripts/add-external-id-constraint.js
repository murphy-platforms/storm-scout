/**
 * Add Unique Constraint on external_id
 * Prevents duplicate advisories with the same external_id
 */

const { initDatabase, getDatabase } = require('../src/config/database');

async function addConstraint() {
    try {
        await initDatabase();
        const db = getDatabase();
        
        console.log('\n═══ Adding Unique Constraint on external_id ═══\n');
        
        // First, verify no duplicates exist
        console.log('Step 1: Checking for existing duplicates...');
        const [duplicates] = await db.query(`
            SELECT COUNT(*) as count
            FROM (
                SELECT external_id
                FROM advisories
                GROUP BY external_id
                HAVING COUNT(*) > 1
            ) as dups
        `);
        
        if (duplicates[0].count > 0) {
            console.log(`❌ ERROR: Found ${duplicates[0].count} duplicate external_ids`);
            console.log('Run fix-external-id-duplicates.js first to clean up duplicates.');
            process.exit(1);
        }
        
        console.log('✅ No duplicates found. Safe to add constraint.\n');
        
        // Check if constraint already exists
        console.log('Step 2: Checking if constraint already exists...');
        const [existingIndexes] = await db.query(`
            SHOW INDEX FROM advisories WHERE Key_name = 'idx_external_id_unique'
        `);
        
        if (existingIndexes.length > 0) {
            console.log('⚠️  Constraint already exists. Nothing to do.\n');
            console.log('Index details:');
            console.log(`  Column: ${existingIndexes[0].Column_name}`);
            console.log(`  Unique: ${existingIndexes[0].Non_unique === 0 ? 'Yes' : 'No'}`);
            process.exit(0);
        }
        
        console.log('✅ Constraint does not exist. Adding now...\n');
        
        // Add the unique constraint
        console.log('Step 3: Adding UNIQUE INDEX idx_external_id_unique...');
        await db.query(`
            ALTER TABLE advisories 
            ADD UNIQUE INDEX idx_external_id_unique (external_id)
        `);
        
        console.log('✅ Unique constraint added successfully!\n');
        
        // Verify constraint was created
        console.log('Step 4: Verifying constraint...');
        const [newIndexes] = await db.query(`
            SHOW INDEX FROM advisories WHERE Key_name = 'idx_external_id_unique'
        `);
        
        if (newIndexes.length > 0) {
            console.log('✅ Constraint verified:');
            console.log(`  Table: ${newIndexes[0].Table}`);
            console.log(`  Column: ${newIndexes[0].Column_name}`);
            console.log(`  Unique: ${newIndexes[0].Non_unique === 0 ? 'Yes' : 'No'}`);
            console.log(`  Index Type: ${newIndexes[0].Index_type}`);
        } else {
            console.log('❌ WARNING: Could not verify constraint was created');
        }
        
        console.log('\n═══ Constraint Addition Complete ═══\n');
        console.log('Future duplicate external_ids will be prevented at database level.');
        console.log('The application will handle duplicates gracefully via ON DUPLICATE KEY UPDATE.\n');
        
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Error adding constraint:', error.message);
        
        if (error.code === 'ER_DUP_KEYNAME') {
            console.log('⚠️  Constraint with this name already exists.');
        } else if (error.code === 'ER_DUP_ENTRY') {
            console.log('⚠️  Cannot add constraint: duplicate external_ids exist in database.');
            console.log('Run fix-external-id-duplicates.js first.');
        } else {
            console.error('Full error:', error);
        }
        
        process.exit(1);
    }
}

addConstraint();
