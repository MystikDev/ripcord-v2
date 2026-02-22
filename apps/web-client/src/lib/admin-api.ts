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

export async function fetchMembers(hubId: string, cursor?: string): Promise<MemberResponse[]> {
  let path = `/v1/hubs/${hubId}/members?limit=50`;
  if (cursor) path += `&cursor=${encodeURIComponent(cursor)}`;
  const res = await apiFetch<{ ok: boolean; data: MemberResponse[] }>(path);
  if (!res.ok || !res.data) throw new Error(res.error ?? 'Failed to fetch members');
  const payload = res.data as unknown as { ok?: boolean; data?: MemberResponse[] };
  return payload.data ?? (res.data as unknown as MemberResponse[]);
}

export async function kickMember(hubId: string, userId: string): Promise<void> {
  const res = await apiFetch(`/v1/hubs/${hubId}/members/${userId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(res.error ?? 'Failed to kick member');
}

// ---------------------------------------------------------------------------
// Bans
// ---------------------------------------------------------------------------

export async function banMember(hubId: string, userId: string, reason?: string): Promise<void> {
  const res = await apiFetch(`/v1/hubs/${hubId}/bans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, reason }),
  });
  if (!res.ok) throw new Error(res.error ?? 'Failed to ban member');
}

export async function unbanMember(hubId: string, userId: string): Promise<void> {
  const res = await apiFetch(`/v1/hubs/${hubId}/bans/${userId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(res.error ?? 'Failed to unban member');
}

export async function listBans(hubId: string): Promise<BanResponse[]> {
  const res = await apiFetch<{ ok: boolean; data: BanResponse[] }>(`/v1/hubs/${hubId}/bans`);
  if (!res.ok || !res.data) throw new Error(res.error ?? 'Failed to fetch bans');
  const payload = res.data as unknown as { ok?: boolean; data?: BanResponse[] };
  return payload.data ?? (res.data as unknown as BanResponse[]);
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export async function assignRole(hubId: string, userId: string, roleId: string): Promise<void> {
  const res = await apiFetch(`/v1/hubs/${hubId}/members/${userId}/roles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roleId }),
  });
  if (!res.ok) throw new Error(res.error ?? 'Failed to assign role');
}

export async function removeRole(hubId: string, userId: string, roleId: string): Promise<void> {
  const res = await apiFetch(`/v1/hubs/${hubId}/members/${userId}/roles/${roleId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(res.error ?? 'Failed to remove role');
}
