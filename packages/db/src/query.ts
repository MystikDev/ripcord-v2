import type { QueryResultRow, PoolClient } from 'pg';
import { pool } from './pool.js';

/**
 * Execute a SQL query and return all matching rows.
 *
 * This is a thin convenience wrapper around `pool.query` that extracts the
 * `rows` array and applies a generic type parameter so callers get typed
 * results without manual casting.
 *
 * @typeParam T - The expected row shape (must extend `QueryResultRow`).
 * @param text  - SQL statement (may contain `$1`, `$2`, ... placeholders).
 * @param params - Bind parameters corresponding to the placeholders.
 * @returns An array of rows typed as `T`.
 *
 * @example
 * ```ts
 * interface User { id: string; email: string; }
 * const users = await query<User>('SELECT id, email FROM users WHERE active = $1', [true]);
 * ```
 */
export async function query<T extends QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const result = await pool.query<T>(text, params);
  return result.rows;
}

/**
 * Execute a SQL query and return at most one row.
 *
 * Useful for lookups by primary key or unique constraint where you expect
 * zero or one results.
 *
 * @typeParam T - The expected row shape (must extend `QueryResultRow`).
 * @param text  - SQL statement.
 * @param params - Bind parameters.
 * @returns The first row typed as `T`, or `null` if no rows matched.
 *
 * @example
 * ```ts
 * interface User { id: string; email: string; }
 * const user = await queryOne<User>('SELECT * FROM users WHERE id = $1', ['abc-123']);
 * if (user) {
 *   console.log(user.email);
 * }
 * ```
 */
export async function queryOne<T extends QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T | null> {
  const result = await pool.query<T>(text, params);
  return result.rows[0] ?? null;
}

/**
 * Run a sequence of queries inside a database transaction.
 *
 * Acquires a dedicated {@link PoolClient}, issues `BEGIN`, invokes the
 * provided callback, and then either `COMMIT`s on success or `ROLLBACK`s
 * if the callback throws. The client is always released back to the pool.
 *
 * @typeParam T - The return type of the transaction callback.
 * @param fn - An async function that receives a {@link PoolClient} and
 *             performs one or more queries within the transaction.
 * @returns The value returned by `fn`.
 * @throws Re-throws any error from `fn` after rolling back.
 *
 * @example
 * ```ts
 * const newOrder = await transaction(async (client) => {
 *   const order = await client.query(
 *     'INSERT INTO orders (user_id) VALUES ($1) RETURNING *',
 *     [userId],
 *   );
 *   await client.query(
 *     'INSERT INTO order_items (order_id, product_id) VALUES ($1, $2)',
 *     [order.rows[0].id, productId],
 *   );
 *   return order.rows[0];
 * });
 * ```
 */
export async function transaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
