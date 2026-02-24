import { z } from "zod";

// ---------------------------------------------------------------------------
// Encrypted Envelope
// ---------------------------------------------------------------------------

/**
 * Zod schema for an end-to-end encrypted message envelope.
 *
 * Every message sent through Ripcord is encrypted client-side before
 * reaching the server. The server only ever sees opaque ciphertext and
 * forwards the envelope to subscribers without inspecting or storing
 * plaintext.
 *
 * Fields:
 * - `envelopeVersion` -- protocol version (currently always `1`).
 * - `channelId`       -- target channel (UUIDv4).
 * - `senderUserId`    -- author user id (UUIDv4).
 * - `senderDeviceId`  -- author device id (UUIDv4).
 * - `sentAt`          -- ISO-8601 datetime string set by the sending client.
 * - `ciphertext`      -- base64-encoded encrypted payload.
 * - `nonce`           -- base64-encoded nonce / IV used for encryption.
 * - `keyId`           -- identifier for the key used to encrypt.
 * - `signature`       -- optional Ed25519 signature over the envelope.
 */
export const EncryptedEnvelopeSchema = z.object({
  /** Protocol version for forward compatibility. */
  envelopeVersion: z.literal(1),
  /** Target channel (UUIDv4). */
  channelId: z.string().uuid(),
  /** Author user id (UUIDv4). */
  senderUserId: z.string().uuid(),
  /** Author device id (UUIDv4). */
  senderDeviceId: z.string().uuid(),
  /** ISO-8601 datetime string set by the sending client. */
  sentAt: z.string().datetime(),
  /** Base64-encoded encrypted payload (max ~48 KB after base64). */
  ciphertext: z.string().min(1, "Ciphertext must not be empty").max(65_536, "Ciphertext exceeds maximum size"),
  /** Base64-encoded nonce / IV used for encryption (max 64 bytes base64). */
  nonce: z.string().min(1, "Nonce must not be empty").max(128, "Nonce too large"),
  /** Identifier for the key used to encrypt this envelope (max 256 chars). */
  keyId: z.string().min(1, "Key id must not be empty").max(256, "Key id too large"),
  /** Optional Ed25519 signature over the envelope fields. */
  signature: z.string().optional(),
  /** Optional attachment IDs to link to this message after creation. */
  attachmentIds: z.array(z.string().uuid()).optional(),
});

/** Runtime-validated encrypted message envelope. */
export type EncryptedEnvelope = z.infer<typeof EncryptedEnvelopeSchema>;
