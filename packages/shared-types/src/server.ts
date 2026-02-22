import { z } from "zod";

// ---------------------------------------------------------------------------
// Channel Type
// ---------------------------------------------------------------------------

/** Supported channel modalities. */
export const ChannelType = {
  TEXT: "text",
  VOICE: "voice",
} as const;

export type ChannelType = (typeof ChannelType)[keyof typeof ChannelType];

// ---------------------------------------------------------------------------
// Hub
// ---------------------------------------------------------------------------

/** A Ripcord hub (community). */
export interface Hub {
  /** Primary key (UUIDv4). */
  id: string;
  /** Display name of the hub. */
  name: string;
  /** User id of the hub owner. */
  ownerUserId: string;
  /** Storage key for the hub icon image, or undefined if no icon is set. */
  iconUrl?: string;
  /** ISO-8601 timestamp of hub creation. */
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Channel
// ---------------------------------------------------------------------------

/** A text or voice channel within a hub. */
export interface Channel {
  /** Primary key (UUIDv4). */
  id: string;
  /** Parent hub id. */
  hubId: string;
  /** Whether this channel carries text messages or real-time voice. */
  type: ChannelType;
  /** Display name shown in the channel list. */
  name: string;
  /** When true, only members with explicit access can see the channel. */
  isPrivate: boolean;
  /** ISO-8601 timestamp of channel creation. */
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Role
// ---------------------------------------------------------------------------

/**
 * A named role within a hub that carries a permission bitfield.
 *
 * `bitsetPermissions` is serialised as a decimal string because permission
 * sets may use bit 31 (ADMINISTRATOR) which overflows a 32-bit signed int
 * when stored as a regular JS number in some contexts.
 */
export interface Role {
  /** Primary key (UUIDv4). */
  id: string;
  /** The hub this role belongs to. */
  hubId: string;
  /** Human-readable role name. */
  name: string;
  /** Sort priority (lower = higher rank). */
  priority: number;
  /** Permission bitfield encoded as a decimal string (bigint-safe). */
  bitsetPermissions: string;
}

// ---------------------------------------------------------------------------
// MemberRole (join table)
// ---------------------------------------------------------------------------

/** Assignment of a role to a hub member. */
export interface MemberRole {
  /** Hub the membership belongs to. */
  hubId: string;
  /** The member's user id. */
  userId: string;
  /** The role being assigned. */
  roleId: string;
}

// ---------------------------------------------------------------------------
// Zod Schemas (runtime validation)
// ---------------------------------------------------------------------------

/** Schema for creating a new hub. Name must be 2-100 characters. */
export const CreateHubSchema = z.object({
  name: z
    .string()
    .min(2, "Hub name must be at least 2 characters")
    .max(100, "Hub name must be at most 100 characters"),
});

/** Inferred input type for {@link CreateHubSchema}. */
export type CreateHubInput = z.infer<typeof CreateHubSchema>;

/** Schema for creating a new channel within a hub. */
export const CreateChannelSchema = z.object({
  name: z
    .string()
    .min(1, "Channel name must be at least 1 character")
    .max(100, "Channel name must be at most 100 characters"),
  type: z.enum(["text", "voice"]),
});

/** Inferred input type for {@link CreateChannelSchema}. */
export type CreateChannelInput = z.infer<typeof CreateChannelSchema>;
