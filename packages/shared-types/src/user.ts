import { z } from "zod";

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

/** Account status lifecycle states. */
export type UserStatus = "active" | "offline" | "banned";

/** A registered Ripcord user account. */
export interface User {
  /** Primary key (UUIDv4). */
  id: string;
  /** Unique display handle visible to other users. */
  handle: string;
  /** SHA-256 hash of the user's email (used for Gravatar, never stored raw). */
  emailHash?: string;
  /** MinIO storage key for the user's avatar image. */
  avatarUrl?: string;
  /** Current account status. */
  status: UserStatus;
  /** ISO-8601 timestamp of account creation. */
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Device
// ---------------------------------------------------------------------------

/** A device registered to a user for E2EE identity purposes. */
export interface Device {
  /** Primary key (UUIDv4). */
  id: string;
  /** Owning user's id. */
  userId: string;
  /** Human-readable label chosen by the user (e.g. "MacBook Pro"). */
  deviceName: string;
  /** Curve25519 public identity key for this device. */
  pubIdentityKey: string;
  /** ISO-8601 timestamp of when the device was registered. */
  createdAt: string;
  /** ISO-8601 timestamp of when the device was revoked, if applicable. */
  revokedAt?: string;
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

/**
 * A refresh-token session tied to a specific user + device pair.
 *
 * Uses token-family rotation detection: each family starts at generation 0
 * and increments on every refresh. If a previous generation is replayed the
 * entire family is revoked (reuse detection).
 */
export interface Session {
  /** Primary key (UUIDv4). */
  id: string;
  /** The user this session belongs to. */
  userId: string;
  /** The device this session was created from. */
  deviceId: string;
  /** SHA-256 hash of the current refresh token. */
  refreshHash: string;
  /** SHA-256 hash of the client IP at session creation. */
  ipHash?: string;
  /** SHA-256 hash of the User-Agent header at session creation. */
  uaHash?: string;
  /** ISO-8601 timestamp of session creation. */
  createdAt: string;
  /** ISO-8601 timestamp of session expiry. */
  expiresAt: string;
  /** ISO-8601 timestamp of explicit revocation, if applicable. */
  revokedAt?: string;
  /** Opaque token-family identifier for rotation detection. */
  tokenFamily: string;
  /** Monotonically increasing counter within the token family. */
  generation: number;
}

// ---------------------------------------------------------------------------
// Zod Schemas (runtime validation)
// ---------------------------------------------------------------------------

/**
 * Schema for creating a new user account.
 *
 * Handle rules:
 * - 3 to 32 characters
 * - Only alphanumeric, underscore, and hyphen allowed
 */
export const CreateUserSchema = z.object({
  handle: z
    .string()
    .min(3, "Handle must be at least 3 characters")
    .max(32, "Handle must be at most 32 characters")
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      "Handle may only contain letters, digits, underscores, and hyphens",
    ),
});

/** Inferred input type for {@link CreateUserSchema}. */
export type CreateUserInput = z.infer<typeof CreateUserSchema>;
