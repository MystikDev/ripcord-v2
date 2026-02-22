/**
 * Database migration runner for Ripcord v2.
 *
 * Reads SQL files from db/migrations/ in sorted order and applies them
 * idempotently. Tracks applied migrations in a schema_migrations table.
 *
 * Usage: tsx scripts/run-migrations.ts
 */

import { readdir, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(__dirname, '..', 'db', 'migrations');

const url = process.env.DATABASE_URL ?? 'postgres://ripcord:ripcord@localhost:5432/ripcord';
const client = new pg.Client({ connectionString: url });

async function run(): Promise<void> {
  await client.connect();
  console.log('[migrator] Connected to database');

  // Ensure migration tracking table exists
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Read and sort migration files
  const allFiles = await readdir(migrationsDir);
  const sqlFiles = allFiles.filter((f) => f.endsWith('.sql')).sort();

  if (sqlFiles.length === 0) {
    console.log('[migrator] No migration files found');
    await client.end();
    return;
  }

  let applied = 0;

  for (const file of sqlFiles) {
    // Check if already applied
    const exists = await client.query(
      'SELECT 1 FROM schema_migrations WHERE filename = $1',
      [file],
    );
    if (exists.rowCount && exists.rowCount > 0) {
      console.log(`[migrator] Skipping ${file} (already applied)`);
      continue;
    }

    // Read and execute migration in a transaction
    const sql = await readFile(resolve(migrationsDir, file), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`[migrator] Applied ${file}`);
      applied++;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[migrator] Failed to apply ${file}:`, err);
      throw err;
    }
  }

  console.log(`[migrator] Done. ${String(applied)} migration(s) applied, ${String(sqlFiles.length - applied)} skipped.`);
  await client.end();
}

run().catch((err: unknown) => {
  console.error('[migrator] Fatal error:', err);
  process.exit(1);
});
