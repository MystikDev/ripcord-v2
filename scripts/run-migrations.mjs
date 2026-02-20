import { readdir, readFile } from 'node:fs/promises';
import { Client } from 'pg';

const url = process.env.DATABASE_URL || 'postgres://ripcord:ripcord_dev@localhost:5432/ripcord';
const client = new Client({ connectionString: url });

await client.connect();
await client.query(`
CREATE TABLE IF NOT EXISTS schema_migrations (
  id SERIAL PRIMARY KEY,
  filename TEXT UNIQUE NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`);

const files = (await readdir('db/migrations')).filter(f => f.endsWith('.sql')).sort();
for (const file of files) {
  const exists = await client.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [file]);
  if (exists.rowCount) continue;
  const sql = await readFile(`db/migrations/${file}`, 'utf8');
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations(filename) VALUES ($1)', [file]);
    await client.query('COMMIT');
    console.log(`applied ${file}`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}
await client.end();
