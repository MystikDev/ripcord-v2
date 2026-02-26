// ---------------------------------------------------------------------------
// Audit Actions
// ---------------------------------------------------------------------------

/**
 * Enumeration of every auditable action in the system.
 *
 * Used by the audit-log service to categorise events for compliance,
 * debugging, and abuse investigation.
 */
export const AuditAction = {
  /** A new user account was registered. */
  USER_REGISTER: "USER_REGISTER",
  /** A user authenticated successfully. */
  USER_LOGIN: "USER_LOGIN",
  /** A user logged out explicitly. */
  USER_LOGOUT: "USER_LOGOUT",
  /** A new refresh-token session was created. */
  SESSION_CREATED: "SESSION_CREATED",
  /** A session was explicitly revoked. */
  SESSION_REVOKED: "SESSION_REVOKED",
  /** A previously used refresh token was replayed (potential theft). */
  SESSION_REUSE_DETECTED: "SESSION_REUSE_DETECTED",
  /** A device uploaded a new X3DH key bundle. */
  KEY_BUNDLE_UPLOADED: "KEY_BUNDLE_UPLOADED",
  /** A device's signed pre-key was rotated. */
  KEY_ROTATION: "KEY_ROTATION",
  /** A one-time pre-key was claimed by another user. */
  PREKEY_CLAIMED: "PREKEY_CLAIMED",
  /** A new hub was created. */
  HUB_CREATED: "HUB_CREATED",
  /** A new channel was created in a hub. */
  CHANNEL_CREATED: "CHANNEL_CREATED",
  /** A user joined a hub. */
  MEMBER_JOINED: "MEMBER_JOINED",
  /** A user left (or was removed from) a hub. */
  MEMBER_LEFT: "MEMBER_LEFT",
  /** An encrypted message envelope was accepted by the server. */
  MESSAGE_SENT: "MESSAGE_SENT",
  /** A message was deleted. */
  MESSAGE_DELETED: "MESSAGE_DELETED",
  /** A message was pinned in a channel. */
  MESSAGE_PINNED: "MESSAGE_PINNED",
  /** A message was unpinned from a channel. */
  MESSAGE_UNPINNED: "MESSAGE_UNPINNED",
  /** A role's permission bitfield was modified. */
  PERMISSION_CHANGED: "PERMISSION_CHANGED",
  /** A file was uploaded to a channel. */
  FILE_UPLOADED: "FILE_UPLOADED",
  /** A hub's settings were updated. */
  HUB_UPDATED: "HUB_UPDATED",
  /** A channel was deleted from a hub. */
  CHANNEL_DELETED: "CHANNEL_DELETED",
  /** A new role was created in a hub. */
  ROLE_CREATED: "ROLE_CREATED",
  /** A role was updated in a hub. */
  ROLE_UPDATED: "ROLE_UPDATED",
  /** A member was kicked from a hub. */
  MEMBER_KICKED: "MEMBER_KICKED",
  /** A member was banned from a hub. */
  MEMBER_BANNED: "MEMBER_BANNED",
  /** A banned member was unbanned. */
  MEMBER_UNBANNED: "MEMBER_UNBANNED",
  /** A role was assigned to a member. */
  ROLE_ASSIGNED: "ROLE_ASSIGNED",
  /** A role was removed from a member. */
  ROLE_UNASSIGNED: "ROLE_UNASSIGNED",
  /** A hub was deleted. */
  HUB_DELETED: "HUB_DELETED",
  /** A role was deleted from a hub. */
  ROLE_DELETED: "ROLE_DELETED",
} as const;

export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

// ---------------------------------------------------------------------------
// Audit Event
// ---------------------------------------------------------------------------

/**
 * A single immutable audit-log entry.
 *
 * Audit events are append-only and never modified after creation.
 */
export interface AuditEvent {
  /** Primary key (UUIDv4). */
  id: string;
  /** Hub the event is associated with (absent for global events). */
  hubId?: string;
  /** User who performed the action (absent for system-initiated events). */
  actorUserId?: string;
  /** Device the actor used (absent for system-initiated events). */
  actorDeviceId?: string;
  /** The auditable action that occurred. */
  action: AuditAction;
  /** Kind of entity the action targeted (e.g. "user", "hub", "channel"). */
  targetType?: string;
  /** Primary key of the target entity. */
  targetId?: string;
  /** Free-form metadata bag for action-specific context. */
  metadata: Record<string, unknown>;
  /** ISO-8601 timestamp of when the event was recorded. */
  createdAt: string;
}
