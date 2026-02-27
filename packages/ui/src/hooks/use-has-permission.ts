/**
 * @module use-has-permission
 * Hook to check whether the current user has a specific permission in the
 * active hub. Returns true if the user is the hub owner, has the ADMINISTRATOR
 * bit, or has the requested permission bit.
 */

import { hasPermission } from '@ripcord/types';
import { useAuthStore } from '../stores/auth-store';
import { useHubStore } from '../stores/server-store';
import { usePermissionStore } from '../stores/permission-store';

/**
 * Check whether the current user has a specific permission in the active hub.
 *
 * @param perm - The permission bit to check (e.g. `Permission.MOVE_MEMBERS`).
 * @returns `true` if the user has the permission (or is the hub owner).
 */
export function useHasPermission(perm: number): boolean {
  const userId = useAuthStore((s) => s.userId);
  const activeHubId = useHubStore((s) => s.activeHubId);
  const hubs = useHubStore((s) => s.hubs);
  const permissions = usePermissionStore((s) => s.permissions);

  if (!userId || !activeHubId) return false;

  // Hub owner always has all permissions
  const hub = hubs.find((h) => h.id === activeHubId);
  if (hub?.ownerId === userId) return true;

  // Check the cached permission bitfield
  const bitfield = permissions[activeHubId];
  if (bitfield === undefined) return false;

  return hasPermission(bitfield, perm);
}
