import { apiFetch } from './api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InviteResponse {
  id: string;
  hubId: string;
  code: string;
  createdBy: string;
  maxUses: number | null;
  uses: number;
  expiresAt: string | null;
  createdAt: string;
}

export interface InvitePreview {
  code: string;
  hubId: string;
  hubName: string;
  isExpired: boolean;
  isExhausted: boolean;
}

export interface InviteAcceptResult {
  message: string;
  hubId: string;
  hubName: string;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export async function createInvite(
  hubId: string,
  options?: { maxUses?: number; expiresAt?: string },
): Promise<InviteResponse> {
  const res = await apiFetch<{ ok: boolean; data: InviteResponse }>(`/v1/hubs/${hubId}/invites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options ?? {}),
  });
  if (!res.ok || !res.data) throw new Error(res.error ?? 'Failed to create invite');
  const payload = res.data as unknown as { ok?: boolean; data?: InviteResponse };
  return payload.data ?? (res.data as unknown as InviteResponse);
}

export async function listInvites(hubId: string): Promise<InviteResponse[]> {
  const res = await apiFetch<{ ok: boolean; data: InviteResponse[] }>(`/v1/hubs/${hubId}/invites`);
  if (!res.ok || !res.data) throw new Error(res.error ?? 'Failed to fetch invites');
  const payload = res.data as unknown as { ok?: boolean; data?: InviteResponse[] };
  return payload.data ?? (res.data as unknown as InviteResponse[]);
}

export async function revokeInvite(hubId: string, inviteId: string): Promise<void> {
  const res = await apiFetch(`/v1/hubs/${hubId}/invites/${inviteId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(res.error ?? 'Failed to revoke invite');
}

export async function getInvitePreview(code: string): Promise<InvitePreview> {
  const res = await apiFetch<{ ok: boolean; data: InvitePreview }>(`/v1/invites/${code}`);
  if (!res.ok || !res.data) throw new Error(res.error ?? 'Invalid invite');
  const payload = res.data as unknown as { ok?: boolean; data?: InvitePreview };
  return payload.data ?? (res.data as unknown as InvitePreview);
}

export async function acceptInvite(code: string): Promise<InviteAcceptResult> {
  const res = await apiFetch<{ ok: boolean; data: InviteAcceptResult }>(`/v1/invites/${code}/accept`, {
    method: 'POST',
  });
  if (!res.ok || !res.data) throw new Error(res.error ?? 'Failed to accept invite');
  const payload = res.data as unknown as { ok?: boolean; data?: InviteAcceptResult };
  return payload.data ?? (res.data as unknown as InviteAcceptResult);
}
