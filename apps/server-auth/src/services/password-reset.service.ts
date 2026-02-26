/**
 * @module password-reset.service
 * Manages 6-digit password reset codes stored in Redis.
 *
 * Keys:
 *   reset:<userId>           → the 6-digit code (TTL 15 min)
 *   reset-cooldown:<userId>  → cooldown flag (TTL 60 s)
 *   reset-count:<userId>     → resend count (TTL 15 min)
 */

import { randomInt } from 'node:crypto';
import { redis } from '../redis.js';
import { logger } from '../logger.js';

/** Code validity window in seconds (15 minutes). */
const CODE_TTL_SEC = 15 * 60;

/** Minimum gap between resends in seconds. */
const COOLDOWN_SEC = 60;

/** Maximum number of codes a user can request per reset window. */
const MAX_RESENDS = 3;

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/**
 * Generate a cryptographically random 6-digit code and store it in Redis.
 *
 * @param userId - The user requesting a password reset.
 * @returns The 6-digit code string.
 */
export async function createResetCode(userId: string): Promise<string> {
  const code = randomInt(100_000, 999_999).toString();

  await redis.set(`reset:${userId}`, code, 'EX', CODE_TTL_SEC);

  logger.debug({ userId }, 'Password reset code created');
  return code;
}

// ---------------------------------------------------------------------------
// Verify
// ---------------------------------------------------------------------------

/**
 * Check a user-submitted code against the stored reset code.
 *
 * On success the code is deleted (single-use).
 *
 * @param userId - User ID.
 * @param code   - The 6-digit code the user entered.
 * @returns `true` if the code matches, `false` otherwise.
 */
export async function verifyResetCode(
  userId: string,
  code: string,
): Promise<boolean> {
  const stored = await redis.get(`reset:${userId}`);
  if (!stored) return false; // expired or never created
  if (stored !== code) return false; // wrong code

  // Delete code so it can't be reused
  await redis.del(`reset:${userId}`);

  // Clean up resend tracking
  await redis.del(`reset-cooldown:${userId}`, `reset-count:${userId}`);

  return true;
}

// ---------------------------------------------------------------------------
// Resend
// ---------------------------------------------------------------------------

/**
 * Generate and return a new reset code, respecting cooldown and max-resend limits.
 *
 * @param userId - User ID.
 * @returns The new 6-digit code, or an error message if rate-limited.
 */
export async function resendResetCode(
  userId: string,
): Promise<{ code: string } | { error: string }> {
  // Check cooldown
  const cooldown = await redis.exists(`reset-cooldown:${userId}`);
  if (cooldown) {
    const ttl = await redis.ttl(`reset-cooldown:${userId}`);
    return { error: `Please wait ${ttl}s before requesting a new code` };
  }

  // Check max resends
  const count = await redis.get(`reset-count:${userId}`);
  if (count && parseInt(count, 10) >= MAX_RESENDS) {
    return { error: 'Maximum reset attempts reached. Please try again later.' };
  }

  // Generate new code
  const code = await createResetCode(userId);

  // Set cooldown
  await redis.set(`reset-cooldown:${userId}`, '1', 'EX', COOLDOWN_SEC);

  // Increment resend counter
  await redis.incr(`reset-count:${userId}`);
  if (!count) {
    await redis.expire(`reset-count:${userId}`, CODE_TTL_SEC);
  }

  return { code };
}
