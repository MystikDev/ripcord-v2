/**
 * Admin API client — member management, bans, and role assignment.
 *
 * Used by the hub admin panel. All endpoints require ADMINISTRATOR or
 * the specific permission for the action (KICK_MEMBERS, BAN_MEMBERS, etc.).
 *
 * @module admin-api
 */

import { apiFetch } from './api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MemberResponse {
  userId: string;
  handle: string;
  avatarUrl?: string;
  joinedAt: string;
  roles?: { id: string; name: string }[];
}

export interface BanResponse {
  hubId: string;
  userId: string;
  bannedBy: string;
  reason?: string;
  bannedAt: string;
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

/** Fetch hub members with cursor-based pagination (50 per page). */
export async function fetchMembers(hubId: string, cursor?: string): Promise<MemberResponse[]> {
  let path = `/v1/hubs/${hubId}/members?limit=50`;
  if (cursor) path += `&cursor=${encodeURIComponent(cursor)}`;
  const res = await apiFetch<{ ok: boolean; data: MemberResponse[] }>(path);
  if (!res.ok || !res.data) throw new Error(res.error ?? 'Failed to fetch members');
  const payload = res.data as unknown as { ok?: boolean; data?: MemberResponse[] };
  return payload.data ?? (res.data as unknown as MemberResponse[]);
}

/** Remove a member from the hub. They can rejoin via invite. */
export async function kickMember(hubId: string, userId: string): Promise<void> {
  const res = await apiFetch(`/v1/hubs/${hubId}/members/${userId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(res.error ?? 'Failed to kick member');
}

// ---------------------------------------------------------------------------
// Bans
// ---------------------------------------------------------------------------

/** Ban a user from the hub. They are ejected and cannot rejoin. */
export async function banMember(hubId: string, userId: string, reason?: string): Promise<void> {
  const res = await apiFetch(`/v1/hubs/${hubId}/bans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, reason }),
  });
  if (!res.ok) throw new Error(res.error ?? 'Failed to ban member');
}

/** Lift a ban, allowing the user to rejoin the hub via invite. */
export async function unbanMember(hubId: string, userId: string): Promise<void> {
  const res = await apiFetch(`/v1/hubs/${hubId}/bans/${userId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(res.error ?? 'Failed to unban member');
}

/** List all active bans for a hub. */
export async function listBans(hubId: string): Promise<BanResponse[]> {
  const res = await apiFetch<{ ok: boolean; data: BanResponse[] }>(`/v1/hubs/${hubId}/bans`);
  if (!res.ok || !res.data) throw new Error(res.error ?? 'Failed to fetch bans');
  const payload = res.data as unknown as { ok?: boolean; data?: BanResponse[] };
  return payload.data ?? (res.data as unknown as BanResponse[]);
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

/** Assign an additional role to a hub member. */
export async function assignRole(hubId: string, userId: string, roleId: string): Promise<void> {
  const res = await apiFetch(`/v1/hubs/${hubId}/members/${userId}/roles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roleId }),
  });
  if (!res.ok) throw new Error(res.error ?? 'Failed to assign role');
}

/** Remove a role from a hub member. */
export async function removeRole(hubId: string, userId: string, roleId: string): Promise<void> {
  const res = await apiFetch(`/v1/hubs/${hubId}/members/${userId}/roles/${roleId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(res.error ?? 'Failed to remove role');
}
