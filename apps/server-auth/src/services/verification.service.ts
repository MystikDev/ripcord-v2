/**
 * @module verification.service
 * Manages 6-digit email verification codes stored in Redis.
 *
 * Keys:
 *   verify:<userId>        → the 6-digit code (TTL 15 min)
 *   verify-cooldown:<userId> → cooldown flag (TTL 60 s)
 *   verify-count:<userId>  → resend count (TTL 15 min)
 */

import { randomInt } from 'node:crypto';
import { redis } from '../redis.js';
import { logger } from '../logger.js';

/** Code validity window in seconds (15 minutes). */
const CODE_TTL_SEC = 15 * 60;

/** Minimum gap between resends in seconds. */
const COOLDOWN_SEC = 60;

/** Maximum number of codes a user can request per verification window. */
const MAX_RESENDS = 3;

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/**
 * Generate a cryptographically random 6-digit code and store it in Redis.
 *
 * @param userId - The user requesting verification.
 * @returns The 6-digit code string.
 */
export async function createVerificationCode(userId: string): Promise<string> {
  const code = randomInt(100_000, 999_999).toString();

  await redis.set(`verify:${userId}`, code, 'EX', CODE_TTL_SEC);

  logger.debug({ userId }, 'Verification code created');
  return code;
}

// ---------------------------------------------------------------------------
// Verify
// ---------------------------------------------------------------------------

/**
 * Check a user-submitted code against the stored code.
 *
 * On success the code is deleted (single-use).
 *
 * @param userId - User ID.
 * @param code   - The 6-digit code the user entered.
 * @returns `true` if the code matches, `false` otherwise.
 */
export async function verifyCode(
  userId: string,
  code: string,
): Promise<boolean> {
  const stored = await redis.get(`verify:${userId}`);
  if (!stored) return false; // expired or never created
  if (stored !== code) return false; // wrong code

  // Delete code so it can't be reused
  await redis.del(`verify:${userId}`);

  // Clean up resend tracking
  await redis.del(`verify-cooldown:${userId}`, `verify-count:${userId}`);

  return true;
}

// ---------------------------------------------------------------------------
// Resend
// ---------------------------------------------------------------------------

/**
 * Generate and return a new code, respecting cooldown and max-resend limits.
 *
 * @param userId - User ID.
 * @returns The new 6-digit code, or `null` if rate-limited.
 * @throws {Error} With descriptive message if rate-limited.
 */
export async function resendCode(
  userId: string,
): Promise<{ code: string } | { error: string }> {
  // Check cooldown
  const cooldown = await redis.exists(`verify-cooldown:${userId}`);
  if (cooldown) {
    const ttl = await redis.ttl(`verify-cooldown:${userId}`);
    return { error: `Please wait ${ttl}s before requesting a new code` };
  }

  // Check max resends
  const count = await redis.get(`verify-count:${userId}`);
  if (count && parseInt(count, 10) >= MAX_RESENDS) {
    return { error: 'Maximum verification attempts reached. Please register again.' };
  }

  // Generate new code
  const code = await createVerificationCode(userId);

  // Set cooldown
  await redis.set(`verify-cooldown:${userId}`, '1', 'EX', COOLDOWN_SEC);

  // Increment resend counter (keep same TTL window as the code)
  await redis.incr(`verify-count:${userId}`);
  // Only set TTL if this is the first resend (key was just created by INCR)
  if (!count) {
    await redis.expire(`verify-count:${userId}`, CODE_TTL_SEC);
  }

  return { code };
}
