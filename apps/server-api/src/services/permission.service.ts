import { redis } from '../redis.js';
import { Permission, computePermissions, hasPermission } from '@ripcord/types';
import * as roleRepo from '../repositories/role.repo.js';
import * as overrideRepo from '../repositories/channel-override.repo.js';
import * as hubRepo from '../repositories/server.repo.js';
import { logger } from '../logger.js';

/** TTL for cached permissions in seconds. */
const PERMISSION_CACHE_TTL = 60;

/**
 * Build the Redis cache key for computed permissions.
 */
function cacheKey(hubId: string, channelId: string, userId: string): string {
  return `perms:${hubId}:${channelId}:${userId}`;
}

/**
 * 5-layer permission resolution with Redis caching.
 *
 * Resolution order:
 * 1. Start with @everyone role permissions for the hub
 * 2. OR with all role permissions the member holds
 * 3. Apply channel role overrides (allow | deny)
 * 4. Apply channel member overrides (allow | deny)
 * 5. ADMIN short-circuit: if ADMINISTRATOR bit is set, return all permissions
 *
 * Results are cached in Redis with a 60-second TTL.
 *
 * @param hubId - Hub UUID.
 * @param channelId - Channel UUID.
 * @param userId - User UUID.
 * @returns The computed permission bitfield.
 */
export async function resolvePermissions(
  hubId: string,
  channelId: string,
  userId: string,
): Promise<number> {
  const key = cacheKey(hubId, channelId, userId);

  // Check cache first
  try {
    const cached = await redis.get(key);
    if (cached !== null) {
      return Number(cached);
    }
  } catch (err) {
    logger.warn({ err }, 'Redis cache read error for permissions -- computing fresh');
  }

  // Layer 0: Hub owner always gets full admin
  const hub = await hubRepo.findById(hubId);
  if (hub && hub.ownerUserId === userId) {
    const allPerms = ~0 >>> 0;
    await cachePermissions(key, allPerms);
    return allPerms;
  }

  // Layer 1: @everyone role base permissions
  const everyoneRole = await roleRepo.findEveryoneRole(hubId);
  let permissions = everyoneRole ? Number(everyoneRole.bitsetPermissions) : 0;

  // Layer 2: OR with all assigned role permissions
  const memberRoles = await roleRepo.findRolesForMember(hubId, userId);
  const roleBits = memberRoles.map((r) => Number(r.bitsetPermissions));
  permissions = computePermissions(permissions, ...roleBits);

  // Early ADMIN short-circuit
  if (hasPermission(permissions, Permission.ADMINISTRATOR)) {
    const allPerms = ~0 >>> 0; // all 32 bits set
    await cachePermissions(key, allPerms);
    return allPerms;
  }

  // Layer 3: Apply channel role overrides
  const allRoleIds = memberRoles.map((r) => r.id);
  if (everyoneRole) {
    allRoleIds.push(everyoneRole.id);
  }

  if (allRoleIds.length > 0) {
    const roleOverrides = await overrideRepo.findRoleOverrides(channelId, allRoleIds);
    for (const override of roleOverrides) {
      permissions |= override.allowBitset;
      permissions &= ~override.denyBitset;
    }
  }

  // Layer 4: Apply channel member overrides
  const memberOverride = await overrideRepo.findMemberOverride(channelId, userId);
  if (memberOverride) {
    permissions |= memberOverride.allowBitset;
    permissions &= ~memberOverride.denyBitset;
  }

  // Layer 5: Final ADMIN check after overrides
  if (hasPermission(permissions, Permission.ADMINISTRATOR)) {
    const allPerms = ~0 >>> 0;
    await cachePermissions(key, allPerms);
    return allPerms;
  }

  await cachePermissions(key, permissions);
  return permissions;
}

/**
 * Check whether a user has a specific permission in a channel.
 *
 * @param hubId - Hub UUID.
 * @param channelId - Channel UUID.
 * @param userId - User UUID.
 * @param perm - The permission to check.
 * @returns True if the permission is granted.
 */
export async function checkPermission(
  hubId: string,
  channelId: string,
  userId: string,
  perm: number,
): Promise<boolean> {
  const permissions = await resolvePermissions(hubId, channelId, userId);
  return hasPermission(permissions, perm);
}

/**
 * Invalidate cached permissions for a hub/channel/user combination.
 *
 * Should be called when roles or overrides change.
 *
 * @param hubId - Hub UUID.
 * @param channelId - Channel UUID (use '*' for all channels).
 * @param userId - User UUID (use '*' for all users).
 */
export async function invalidatePermissions(
  hubId: string,
  channelId?: string,
  userId?: string,
): Promise<void> {
  try {
    if (channelId && userId) {
      await redis.del(cacheKey(hubId, channelId, userId));
    } else {
      // Pattern-based invalidation for broader changes using SCAN (safe for production)
      const pattern = `perms:${hubId}:${channelId ?? '*'}:${userId ?? '*'}`;
      let cursor = '0';
      do {
        const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      } while (cursor !== '0');
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to invalidate permission cache');
  }
}

/**
 * Cache computed permissions in Redis.
 */
async function cachePermissions(key: string, permissions: number): Promise<void> {
  try {
    await redis.set(key, String(permissions), 'EX', PERMISSION_CACHE_TTL);
  } catch (err) {
    logger.warn({ err }, 'Failed to cache permissions');
  }
}
