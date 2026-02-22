// ---------------------------------------------------------------------------
// Gateway Opcodes
// ---------------------------------------------------------------------------

/**
 * Numeric opcodes exchanged over the WebSocket gateway.
 *
 * Opcodes are grouped by direction:
 * - Client-to-server: AUTH, SUBSCRIBE, UNSUBSCRIBE, HEARTBEAT
 * - Server-to-client: AUTH_OK, AUTH_FAIL, HELLO, HEARTBEAT_ACK, events, ERROR
 * - Bi-directional events: MESSAGE_*, PRESENCE_*, MEMBER_*
 */
export const GatewayOpcode = {
  /** Client sends a bearer token to authenticate. */
  AUTH: 0,
  /** Server confirms authentication succeeded. */
  AUTH_OK: 1,
  /** Server rejects authentication. */
  AUTH_FAIL: 2,
  /** Server greeting sent immediately after connection, carries heartbeat interval. */
  HELLO: 3,
  /** Client requests subscription to one or more channels. */
  SUBSCRIBE: 4,
  /** Client requests unsubscription from one or more channels. */
  UNSUBSCRIBE: 5,
  /** Client heartbeat ping. */
  HEARTBEAT: 6,
  /** Server heartbeat acknowledgement. */
  HEARTBEAT_ACK: 7,
  /** A new message was created in a subscribed channel. */
  MESSAGE_CREATED: 10,
  /** An existing message was edited. */
  MESSAGE_EDITED: 11,
  /** A message was deleted. */
  MESSAGE_DELETED: 12,
  /** A user's presence status changed. */
  PRESENCE_UPDATED: 13,
  /** A hub member's roles or nickname changed. */
  MEMBER_UPDATED: 14,
  /** A user started typing in a channel. */
  TYPING_START: 20,
  /** A user stopped typing in a channel. */
  TYPING_STOP: 21,
  /** Read state update for unread tracking. */
  READ_STATE_UPDATE: 22,
  /** A user joined, left, or updated their voice state in a channel. */
  VOICE_STATE_UPDATE: 23,
  /** Generic server-to-client error. */
  ERROR: 99,
} as const;

export type GatewayOpcode = (typeof GatewayOpcode)[keyof typeof GatewayOpcode];

// ---------------------------------------------------------------------------
// Gateway Message Wrapper
// ---------------------------------------------------------------------------

/**
 * Top-level frame sent or received over the WebSocket connection.
 *
 * @typeParam T - shape of the `d` (data) payload, varies by opcode.
 */
export interface GatewayMessage<T = unknown> {
  /** The operation code identifying the event or command type. */
  op: GatewayOpcode;
  /** Payload data specific to the opcode. */
  d: T;
  /** Monotonically increasing sequence number (server-to-client events only). */
  seq?: number;
  /** Unix timestamp in milliseconds when the message was created. */
  ts: number;
}

// ---------------------------------------------------------------------------
// Payload Types
// ---------------------------------------------------------------------------

/** Payload for {@link GatewayOpcode.AUTH}. */
export interface AuthPayload {
  /** Bearer access token. */
  token: string;
}

/** Payload for {@link GatewayOpcode.SUBSCRIBE} and {@link GatewayOpcode.UNSUBSCRIBE}. */
export interface SubscribePayload {
  /** Channel ids to subscribe to (or unsubscribe from). */
  channelIds: string[];
}

/** Payload for {@link GatewayOpcode.HELLO}. */
export interface HelloPayload {
  /** Expected heartbeat interval in milliseconds. */
  heartbeatIntervalMs: number;
}

// ---------------------------------------------------------------------------
// Presence
// ---------------------------------------------------------------------------

/** Allowed user presence states. */
export type PresenceStatus = "online" | "idle" | "dnd" | "offline";

/** Payload for {@link GatewayOpcode.PRESENCE_UPDATED}. */
export interface PresencePayload {
  /** The user whose presence changed. */
  userId: string;
  /** New presence status. */
  status: PresenceStatus;
  /** ISO-8601 timestamp of the user's last activity, if known. */
  lastSeen?: string;
}

/** Payload for TYPING_START / TYPING_STOP. */
export interface TypingPayload {
  /** The channel where typing is happening. */
  channelId: string;
  /** The user who is typing. */
  userId: string;
  /** User's display handle (for UI without extra lookup). */
  handle?: string;
}

/** Payload for READ_STATE_UPDATE. */
export interface ReadStatePayload {
  /** Channel whose read state changed. */
  channelId: string;
  /** Last message ID that was read. */
  lastReadMessageId: string;
  /** Number of unread mentions. */
  mentionCount: number;
}

// ---------------------------------------------------------------------------
// Voice State
// ---------------------------------------------------------------------------

/** Payload for {@link GatewayOpcode.VOICE_STATE_UPDATE} (client-to-server and server-to-client). */
export interface VoiceStatePayload {
  /** The voice channel ID. */
  channelId: string;
  /** The user whose voice state changed. */
  userId: string;
  /** Display handle for sidebar rendering. */
  handle?: string;
  /** The action being taken. */
  action: 'join' | 'leave' | 'update';
  /** Whether the user has self-muted their microphone. */
  selfMute?: boolean;
  /** Whether the user has self-deafened. */
  selfDeaf?: boolean;
}

/** A single participant connected to a voice channel. */
export interface VoiceParticipant {
  /** User ID of the participant. */
  userId: string;
  /** Display handle. */
  handle?: string;
  /** Whether the user is self-muted. */
  selfMute: boolean;
  /** Whether the user is self-deafened. */
  selfDeaf: boolean;
  /** ISO-8601 timestamp of when the user joined. */
  joinedAt: string;
}
