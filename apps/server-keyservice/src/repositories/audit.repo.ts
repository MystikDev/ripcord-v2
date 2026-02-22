import { query } from '@ripcord/db';
import type { AuditAction } from '@ripcord/types';

/**
 * Insert an immutable audit event.
 *
 * Audit events are append-only records of security-relevant actions.
 * They are never modified or deleted after creation.
 *
 * @param actorUserId   - User who performed the action (null for system events).
 * @param actorDeviceId - Device the actor used (null for system events).
 * @param action        - The auditable action that occurred.
 * @param targetType    - Kind of entity targeted (e.g. "user", "device").
 * @param targetId      - Primary key of the targeted entity.
 * @param metadata      - Free-form metadata bag for action-specific context.
 */
export async function create(
  actorUserId: string | null,
  actorDeviceId: string | null,
  action: AuditAction,
  targetType: string | null,
  targetId: string | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await query(
    `INSERT INTO audit_events
       (actor_user_id, actor_device_id, action, target_type, target_id, metadata_jsonb)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [actorUserId, actorDeviceId, action, targetType, targetId, JSON.stringify(metadata)],
  );
}
