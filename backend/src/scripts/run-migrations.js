/**
 * Database Migration Runner
 *
 * Applies pending SQL migration files in order and records each in the
 * schema_migrations table. Safe to run multiple times — already-applied
 * migrations are skipped.
 *
 * Usage:
 *   node src/scripts/run-migrations.js           # apply pending migrations
 *   node src/scripts/run-migrations.js --status  # show applied / pending list
 *   node src/scripts/run-migrations.js --baseline # mark all existing files as
 *                                                  # applied without running them
 *                                                  # (use once on an existing DB)
 *
 * Migration file conventions:
 *   - Forward migrations: any *.sql file in src/data/migrations/
 *   - Rollback files are excluded:  *.rollback.sql  or  rollback-*.sql
 *   - Files are applied in ascending alphabetical order (dated filenames
 *     like 20260309-*.sql sort correctly by date automatically)
 *
 * @generated AI-authored (Claude, Warp) — vanilla JS by design
 */

'use strict';

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { initDatabase, getDatabase } = require('../config/database');

const MIGRATIONS_DIR = path.join(__dirname, '../data/migrations');

// ─── helpers ────────────────────────────────────────────────────────────────

function isRollback(filename) {
    return filename.endsWith('.rollback.sql') || filename.startsWith('rollback-');
}

function getMigrationFiles() {
    return fs
        .readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith('.sql') && !isRollback(f))
        .sort(); // alphabetical = chronological for dated filenames
}

async function ensureMigrationsTable(pool) {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   VARCHAR(255) NOT NULL,
      applied_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (filename)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function getApplied(pool) {
    const [rows] = await pool.query('SELECT filename FROM schema_migrations ORDER BY applied_at ASC');
    return new Set(rows.map((r) => r.filename));
}

async function recordMigration(pool, filename) {
    await pool.query('INSERT IGNORE INTO schema_migrations (filename) VALUES (?)', [filename]);
}

// ─── commands ────────────────────────────────────────────────────────────────

async function status() {
    const pool = getDatabase();
    await ensureMigrationsTable(pool);
    const applied = await getApplied(pool);
    const allFiles = getMigrationFiles();
    const pending = allFiles.filter((f) => !applied.has(f));

    console.log('\n── schema_migrations status ──────────────────────────');
    console.log(`  Applied : ${applied.size}`);
    console.log(`  Pending : ${pending.length}`);
    console.log(`  Total   : ${allFiles.length}`);

    if (applied.size > 0) {
        console.log('\nApplied migrations:');
        for (const f of applied) {
            console.log(`  ✓  ${f}`);
        }
    }

    if (pending.length > 0) {
        console.log('\nPending migrations:');
        for (const f of pending) {
            console.log(`  ·  ${f}`);
        }
    } else {
        console.log('\nAll migrations are up to date.');
    }
    console.log('──────────────────────────────────────────────────────\n');
}

async function baseline() {
    const pool = getDatabase();
    await ensureMigrationsTable(pool);
    const allFiles = getMigrationFiles();

    console.log(`\nBaselining ${allFiles.length} migration files (marking as applied without running)...`);
    let marked = 0;
    for (const filename of allFiles) {
        await recordMigration(pool, filename);
        console.log(`  ✓  ${filename}`);
        marked++;
    }
    console.log(`\nDone. ${marked} migrations marked as applied.\n`);
}

async function migrate() {
    const pool = getDatabase();
    await ensureMigrationsTable(pool);
    const applied = await getApplied(pool);
    const allFiles = getMigrationFiles();
    const pending = allFiles.filter((f) => !applied.has(f));

    if (pending.length === 0) {
        console.log('All migrations are up to date. Nothing to apply.');
        return;
    }

    console.log(`\nApplying ${pending.length} pending migration(s)...\n`);

    for (const filename of pending) {
        const filePath = path.join(MIGRATIONS_DIR, filename);
        const sql = fs.readFileSync(filePath, 'utf8');

        // Split on statement delimiter so multi-statement files run correctly.
        // Strip SQL line comments first, then split and drop blank entries.
        const stripped = sql.replace(/--[^\n]*/g, '');
        const statements = stripped
            .split(';')
            .map((s) => s.trim())
            .filter((s) => s.length > 0);

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            for (const statement of statements) {
                await connection.query(statement);
            }

            await recordMigration(connection, filename);
            await connection.commit();
            console.log(`  ✓  ${filename}`);
        } catch (err) {
            await connection.rollback();
            console.error(`\n  ✗  ${filename}`);
            console.error(`     Error: ${err.message}`);
            console.error('\nMigration aborted. Fix the error and re-run.\n');
            connection.release();
            process.exit(1);
        }
        connection.release();
    }

    console.log(`\n${pending.length} migration(s) applied successfully.\n`);
}

// ─── entry point ─────────────────────────────────────────────────────────────

async function main() {
    const args = process.argv.slice(2);

    try {
        await initDatabase();

        if (args.includes('--status')) {
            await status();
        } else if (args.includes('--baseline')) {
            await baseline();
        } else {
            await migrate();
        }
        process.exit(0);
    } catch (err) {
        console.error('Migration runner error:', err.message);
        process.exit(1);
    }
}

main();
