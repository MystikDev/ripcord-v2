import { z } from "zod";

// ---------------------------------------------------------------------------
// Key Bundle
// ---------------------------------------------------------------------------

/**
 * A public key bundle uploaded by a device for X3DH key agreement.
 *
 * Other clients fetch this bundle to establish an initial shared secret
 * without requiring the target device to be online.
 */
export interface KeyBundle {
  /** Owning user id (UUIDv4). */
  userId: string;
  /** Device that owns this bundle. */
  deviceId: string;
  /** Curve25519 long-term identity public key (base64). */
  identityPub: string;
  /** Curve25519 signed pre-key public key (base64). */
  signedPrekeyPub: string;
  /** Ed25519 signature of the signed pre-key, produced with the identity key (base64). */
  signedPrekeySig: string;
  /** ISO-8601 timestamp of when the bundle was uploaded. */
  uploadedAt: string;
}

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

/**
 * Schema for uploading a fresh key bundle along with a batch of one-time
 * pre-keys.
 *
 * The server stores the bundle and appends the one-time keys to the
 * device's unclaimed pool (max 100 per upload).
 */
export const UploadBundleSchema = z.object({
  /** Device this bundle belongs to (UUIDv4). */
  deviceId: z.string().uuid(),
  /** Curve25519 identity public key (base64). */
  identityPub: z.string().min(1, "Identity public key is required"),
  /** Curve25519 signed pre-key public key (base64). */
  signedPrekeyPub: z.string().min(1, "Signed pre-key public key is required"),
  /** Ed25519 signature of the signed pre-key (base64). */
  signedPrekeySig: z.string().min(1, "Signed pre-key signature is required"),
  /** Batch of one-time pre-keys to replenish the unclaimed pool. */
  oneTimePrekeys: z
    .array(z.string().min(1, "One-time pre-key must not be empty"))
    .max(100, "Cannot upload more than 100 one-time pre-keys at once"),
});

/** Inferred input type for {@link UploadBundleSchema}. */
export type UploadBundleInput = z.infer<typeof UploadBundleSchema>;

/**
 * Schema for claiming a one-time pre-key from a target device.
 *
 * The server atomically removes one unclaimed key and returns the full
 * bundle so the caller can perform X3DH.
 */
export const ClaimPrekeySchema = z.object({
  /** Target user whose key is being claimed (UUIDv4). */
  targetUserId: z.string().uuid(),
  /** Target device whose key is being claimed (UUIDv4). */
  targetDeviceId: z.string().uuid(),
});

/** Inferred input type for {@link ClaimPrekeySchema}. */
export type ClaimPrekeyInput = z.infer<typeof ClaimPrekeySchema>;

// ---------------------------------------------------------------------------
// Prekey Count
// ---------------------------------------------------------------------------

/** Reports how many unclaimed one-time pre-keys remain for a device. */
export interface PrekeyCount {
  /** Device id (UUIDv4). */
  deviceId: string;
  /** Number of unclaimed one-time pre-keys remaining. */
  unclaimed: number;
}
