import { query } from '@ripcord/db';
import type { AuditAction } from '@ripcord/types';

// ---------------------------------------------------------------------------
// Row type returned by findByHub queries
// ---------------------------------------------------------------------------

export interface AuditEventRow {
  id: string;
  hubId: string | null;
  actorUserId: string | null;
  actorDeviceId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/**
 * Insert an immutable audit event.
 *
 * Audit events are append-only records of security-relevant actions.
 * They are never modified or deleted after creation.
 *
 * @param actorUserId   - User who performed the action (null for system events).
 * @param actorDeviceId - Device the actor used (null for system events).
 * @param action        - The auditable action that occurred.
 * @param targetType    - Kind of entity targeted (e.g. "user", "session").
 * @param targetId      - Primary key of the targeted entity.
 * @param metadata      - Free-form metadata bag for action-specific context.
 * @param hubId         - Hub the event is associated with (null for global events).
 */
export async function create(
  actorUserId: string | null,
  actorDeviceId: string | null,
  action: AuditAction,
  targetType: string | null,
  targetId: string | null,
  metadata: Record<string, unknown> = {},
  hubId: string | null = null,
): Promise<void> {
  await query(
    `INSERT INTO audit_events
       (actor_user_id, actor_device_id, action, target_type, target_id, metadata_jsonb, hub_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [actorUserId, actorDeviceId, action, targetType, targetId, JSON.stringify(metadata), hubId],
  );
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/**
 * Fetch audit events for a hub with optional filters and cursor pagination.
 *
 * Results are ordered by created_at DESC, id DESC and limited to at most 100
 * rows per call. Cursor-based pagination uses the event ID.
 *
 * @param hubId   - Hub UUID to fetch events for.
 * @param options - Optional filters and pagination controls.
 * @returns Array of audit event rows matching the criteria.
 */
export async function findByHub(
  hubId: string,
  options?: {
    action?: string;
    actorId?: string;
    before?: string; // ISO timestamp
    after?: string;  // ISO timestamp
    cursor?: string; // event ID for keyset pagination
    limit?: number;
  },
): Promise<AuditEventRow[]> {
  const params: unknown[] = [hubId];
  const conditions: string[] = ['hub_id = $1'];
  let paramIdx = 2;

  if (options?.action) {
    conditions.push(`action = $${paramIdx}`);
    params.push(options.action);
    paramIdx++;
  }
  if (options?.actorId) {
    conditions.push(`actor_user_id = $${paramIdx}`);
    params.push(options.actorId);
    paramIdx++;
  }
  if (options?.before) {
    conditions.push(`created_at < $${paramIdx}`);
    params.push(options.before);
    paramIdx++;
  }
  if (options?.after) {
    conditions.push(`created_at > $${paramIdx}`);
    params.push(options.after);
    paramIdx++;
  }
  if (options?.cursor) {
    conditions.push(`id < $${paramIdx}`);
    params.push(options.cursor);
    paramIdx++;
  }

  const limit = Math.min(options?.limit ?? 50, 100);

  const sql = `
    SELECT
      id,
      hub_id        AS "hubId",
      actor_user_id AS "actorUserId",
      actor_device_id AS "actorDeviceId",
      action,
      target_type   AS "targetType",
      target_id     AS "targetId",
      metadata_jsonb AS "metadata",
      created_at    AS "createdAt"
    FROM audit_events
    WHERE ${conditions.join(' AND ')}
    ORDER BY created_at DESC, id DESC
    LIMIT ${limit}
  `;

  return query<AuditEventRow>(sql, params);
}
