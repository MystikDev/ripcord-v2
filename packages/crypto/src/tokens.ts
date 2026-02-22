import { randomBytes, createHash, randomUUID } from 'node:crypto';

/**
 * Generate a cryptographically random refresh token.
 *
 * Produces 48 random bytes encoded as a URL-safe Base64 string (64 characters).
 * This token is meant to be stored client-side and sent back to the auth
 * service when requesting a new access token.
 *
 * The raw token should **never** be persisted server-side -- store the hash
 * returned by {@link hashRefreshToken} instead.
 *
 * @returns A base64url-encoded random string suitable for use as a refresh token.
 *
 * @example
 * ```ts
 * const token = generateRefreshToken();
 * // token === 'dG9rZW4tZXhhbXBsZS...' (64 chars)
 * ```
 */
export function generateRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

/**
 * Compute a SHA-256 hex digest of a refresh token.
 *
 * The resulting hash is what gets stored in the database. Comparing hashes
 * instead of raw tokens means a database leak does not directly expose
 * usable credentials.
 *
 * @param token - The raw refresh token string to hash.
 * @returns A lowercase hex-encoded SHA-256 hash (64 characters).
 *
 * @example
 * ```ts
 * const hash = hashRefreshToken(token);
 * // Store `hash` in the sessions table, not `token`.
 * ```
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Generate a new UUID v4 request identifier.
 *
 * Used to correlate log entries and distributed traces across services
 * for a single inbound request.
 *
 * @returns A standard UUID v4 string (e.g. `'550e8400-e29b-41d4-a716-446655440000'`).
 *
 * @example
 * ```ts
 * const reqId = generateRequestId();
 * res.setHeader('X-Request-Id', reqId);
 * ```
 */
export function generateRequestId(): string {
  return randomUUID();
}
