import pg from 'pg';
import { env } from '@ripcord/config';

const { Pool } = pg;

/**
 * Shared PostgreSQL connection pool.
 *
 * The pool is configured with sensible defaults for a backend service:
 * - Up to 20 concurrent connections
 * - Idle connections are released after 30 seconds
 * - New connection attempts time out after 5 seconds
 *
 * Uses {@link env.DATABASE_URL} from `@ripcord/config` for the connection string.
 *
 * @example
 * ```ts
 * import { pool } from '@ripcord/db';
 *
 * const result = await pool.query('SELECT NOW()');
 * ```
 */
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

/**
 * Gracefully drain and close every connection in the pool.
 *
 * Call this during server shutdown to ensure all in-flight queries finish
 * and the underlying TCP sockets are released cleanly.
 *
 * @example
 * ```ts
 * import { closePool } from '@ripcord/db';
 *
 * process.on('SIGTERM', async () => {
 *   await closePool();
 *   process.exit(0);
 * });
 * ```
 */
export async function closePool(): Promise<void> {
  await pool.end();
}
