import { apiFetch } from './api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuditEventResponse {
  id: string;
  hubId: string | null;
  actorUserId: string | null;
  actorDeviceId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditLogFilters {
  action?: string;
  actorId?: string;
  before?: string;
  after?: string;
  cursor?: string;
  limit?: number;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/** Fetch audit log events for a hub with optional filters and pagination. */
export async function fetchAuditLog(
  hubId: string,
  filters?: AuditLogFilters,
): Promise<AuditEventResponse[]> {
  const params = new URLSearchParams();
  if (filters?.action) params.set('action', filters.action);
  if (filters?.actorId) params.set('actorId', filters.actorId);
  if (filters?.before) params.set('before', filters.before);
  if (filters?.after) params.set('after', filters.after);
  if (filters?.cursor) params.set('cursor', filters.cursor);
  if (filters?.limit != null) params.set('limit', String(filters.limit));

  const qs = params.toString();
  const path = `/v1/hubs/${hubId}/audit-log${qs ? `?${qs}` : ''}`;

  const res = await apiFetch<{ ok: boolean; data: AuditEventResponse[] }>(path);
  if (!res.ok || !res.data) throw new Error(res.error ?? 'Failed to fetch audit log');
  const payload = res.data as unknown as { ok?: boolean; data?: AuditEventResponse[] };
  return payload.data ?? (res.data as unknown as AuditEventResponse[]);
}
