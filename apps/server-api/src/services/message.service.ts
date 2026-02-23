import { EncryptedEnvelopeSchema, type EncryptedEnvelope, ApiError, AuditAction } from '@ripcord/types';
import { redis } from '../redis.js';
import * as messageRepo from '../repositories/message.repo.js';
import type { Message } from '../repositories/message.repo.js';
import * as attachmentRepo from '../repositories/attachment.repo.js';
import * as auditRepo from '../repositories/audit.repo.js';
import { logger } from '../logger.js';

/** Maximum number of messages per page. */
const MAX_LIMIT = 100;
/** Default number of messages per page. */
const DEFAULT_LIMIT = 50;

/**
 * Validate and persist an encrypted message, then publish to Redis
 * for gateway fanout.
 *
 * The envelope ciphertext is treated as opaque -- it is never inspected,
 * parsed, or logged by the server.
 *
 * @param envelope - The raw envelope payload to validate and persist.
 * @param authUserId - The authenticated user's ID (from JWT).
 * @param authDeviceId - The authenticated device's ID (from JWT).
 * @returns The persisted message.
 * @throws {ApiError} 400 if validation fails or sender mismatch.
 */
export async function sendMessage(
  envelope: unknown,
  authUserId: string,
  authDeviceId: string,
): Promise<Message> {
  // Validate envelope structure with Zod
  const parseResult = EncryptedEnvelopeSchema.safeParse(envelope);
  if (!parseResult.success) {
    throw ApiError.badRequest('Invalid message envelope', parseResult.error.issues);
  }

  const validated: EncryptedEnvelope = parseResult.data;

  // Verify sender matches authenticated user
  if (validated.senderUserId !== authUserId) {
    throw ApiError.badRequest('Envelope senderUserId does not match authenticated user');
  }

  if (validated.senderDeviceId !== authDeviceId) {
    throw ApiError.badRequest('Envelope senderDeviceId does not match authenticated device');
  }

  // Persist to database
  const message = await messageRepo.create(
    validated.channelId,
    validated.senderUserId,
    validated.senderDeviceId,
    validated,
  );

  // Link attachments to the real message ID (replaces placeholder IDs)
  let attachments: Awaited<ReturnType<typeof attachmentRepo.findByMessageId>> = [];
  if (validated.attachmentIds && validated.attachmentIds.length > 0) {
    try {
      await attachmentRepo.updateMessageId(validated.attachmentIds, message.id);
      attachments = await attachmentRepo.findByMessageId(message.id);
    } catch (err) {
      logger.error({ err, messageId: message.id }, 'Failed to link attachments');
    }
  }

  // Publish to Redis for gateway fanout (include attachments if any)
  const publishData = attachments.length > 0
    ? { ...message, attachments: attachments.map((a) => ({
        id: a.id,
        fileNameEncrypted: a.fileNameEncrypted,
        fileSize: a.fileSize,
        encryptionKeyId: a.encryptionKeyId,
        nonce: a.nonce,
      })) }
    : message;
  try {
    await redis.publish(`ch:${validated.channelId}`, JSON.stringify({
      type: 'MESSAGE_CREATE',
      data: publishData,
    }));
  } catch (err) {
    // Redis pub failure should not fail the message send
    logger.error({ err, channelId: validated.channelId }, 'Failed to publish message to Redis');
  }

  // Create audit event (fire-and-forget)
  auditRepo.create(
    authUserId,
    authDeviceId,
    AuditAction.MESSAGE_SENT,
    'channel',
    validated.channelId,
    { messageId: message.id },
  ).catch((err: unknown) => {
    logger.error({ err }, 'Failed to create message audit event');
  });

  return message;
}

/**
 * Fetch messages from a channel with cursor-based pagination.
 *
 * @param channelId - Channel UUID.
 * @param cursor - Optional message ID to paginate from.
 * @param limit - Number of messages to return (default 50, max 100).
 * @returns Array of messages in descending chronological order.
 */
export async function getMessages(
  channelId: string,
  cursor?: string,
  limit?: number,
) {
  const effectiveLimit = Math.min(Math.max(limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const messages = await messageRepo.findByChannel(channelId, effectiveLimit, cursor);

  // Batch-fetch attachments for returned messages
  if (messages.length === 0) return messages;

  const enriched = await Promise.all(
    messages.map(async (msg) => {
      const atts = await attachmentRepo.findByMessageId(msg.id);
      if (atts.length === 0) return msg;
      return {
        ...msg,
        attachments: atts.map((a) => ({
          id: a.id,
          fileNameEncrypted: a.fileNameEncrypted,
          fileSize: a.fileSize,
          encryptionKeyId: a.encryptionKeyId,
          nonce: a.nonce,
        })),
      };
    }),
  );

  return enriched;
}
