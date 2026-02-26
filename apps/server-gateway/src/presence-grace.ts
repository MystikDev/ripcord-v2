/**
 * @module presence-grace
 * Manages a grace period before marking a user as offline.
 *
 * When a user's last WebSocket connection closes, we delay the offline
 * transition by a few seconds. If the user reconnects within that window
 * (e.g. token refresh, brief network blip), we cancel the pending offline
 * broadcast — preventing presence flapping in the member list.
 *
 * This mirrors the `REJOIN_GRACE_MS` pattern used in voice-state.ts.
 */

import { log } from './logger.js';

/** Grace period before setting a user offline (milliseconds). */
const OFFLINE_GRACE_MS = 5_000;

/** Pending offline timers keyed by userId. */
const pendingOffline = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Schedule a delayed offline transition for a user.
 *
 * @param userId - The user whose last connection just closed.
 * @param offlineFn - The function to call after the grace period
 *                    (should set presence to offline and broadcast).
 */
export function scheduleOffline(
  userId: string,
  offlineFn: () => void,
): void {
  // Cancel any existing pending offline for this user (shouldn't happen, but be safe)
  cancelPendingOffline(userId);

  const timer = setTimeout(() => {
    pendingOffline.delete(userId);
    offlineFn();
  }, OFFLINE_GRACE_MS);

  pendingOffline.set(userId, timer);
  log.debug({ userId, graceMs: OFFLINE_GRACE_MS }, 'Scheduled offline grace period');
}

/**
 * Cancel a pending offline transition (e.g. user reconnected in time).
 *
 * @param userId - The user who just re-authenticated.
 * @returns `true` if a pending offline was cancelled, `false` if none existed.
 */
export function cancelPendingOffline(userId: string): boolean {
  const timer = pendingOffline.get(userId);
  if (timer) {
    clearTimeout(timer);
    pendingOffline.delete(userId);
    log.debug({ userId }, 'Cancelled pending offline — user reconnected');
    return true;
  }
  return false;
}
