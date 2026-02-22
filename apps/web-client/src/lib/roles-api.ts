import { apiFetch } from './api';
import type { ApiResponse } from './api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RoleResponse {
  id: string;
  hubId: string;
  name: string;
  priority: number;
  bitsetPermissions: string;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export async function fetchRoles(hubId: string): Promise<RoleResponse[]> {
  const res = await apiFetch<{ ok: boolean; data: RoleResponse[] }>(`/v1/hubs/${hubId}/roles`);
  if (!res.ok || !res.data) throw new Error(res.error ?? 'Failed to fetch roles');
  const payload = res.data as unknown as { ok?: boolean; data?: RoleResponse[] };
  return payload.data ?? (res.data as unknown as RoleResponse[]);
}

export async function createRole(
  hubId: string,
  data: { name: string; priority?: number; bitsetPermissions?: string },
): Promise<RoleResponse> {
  const res = await apiFetch<{ ok: boolean; data: RoleResponse }>(`/v1/hubs/${hubId}/roles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok || !res.data) throw new Error(res.error ?? 'Failed to create role');
  const payload = res.data as unknown as { ok?: boolean; data?: RoleResponse };
  return payload.data ?? (res.data as unknown as RoleResponse);
}

export async function updateRole(
  hubId: string,
  roleId: string,
  data: { name?: string; priority?: number; bitsetPermissions?: string },
): Promise<RoleResponse> {
  const res = await apiFetch<{ ok: boolean; data: RoleResponse }>(
    `/v1/hubs/${hubId}/roles/${roleId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    },
  );
  if (!res.ok || !res.data) throw new Error(res.error ?? 'Failed to update role');
  const payload = res.data as unknown as { ok?: boolean; data?: RoleResponse };
  return payload.data ?? (res.data as unknown as RoleResponse);
}

export async function deleteRole(hubId: string, roleId: string): Promise<void> {
  const res = await apiFetch(`/v1/hubs/${hubId}/roles/${roleId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(res.error ?? 'Failed to delete role');
}

export async function deleteHub(hubId: string): Promise<void> {
  const res = await apiFetch(`/v1/hubs/${hubId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(res.error ?? 'Failed to delete hub');
}
