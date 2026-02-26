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
      // Verify the caller owns every attachment before linking
      for (const attId of validated.attachmentIds) {
        const att = await attachmentRepo.findById(attId);
        if (!att) {
          throw ApiError.badRequest(`Attachment ${attId} not found`);
        }
        if (att.uploaderUserId !== authUserId) {
          throw ApiError.forbidden(`Attachment ${attId} does not belong to you`);
        }
        if (att.channelId !== validated.channelId) {
          throw ApiError.badRequest(`Attachment ${attId} was uploaded to a different channel`);
        }
      }

      await attachmentRepo.updateMessageId(validated.attachmentIds, message.id);
      attachments = await attachmentRepo.findByMessageId(message.id);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      logger.error({ err, messageId: message.id }, 'Failed to link attachments');
    }
  }

  // Publish to Redis for gateway fanout (include attachments if any)
  const publishData = attachments.length > 0
    ? { ...message, attachments: attachments.map((a) => ({
        id: a.id,
        fileNameEncrypted: a.fileNameEncrypted,
        fileSize: a.fileSize,
        contentTypeEncrypted: a.contentTypeEncrypted,
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
          contentTypeEncrypted: a.contentTypeEncrypted,
          encryptionKeyId: a.encryptionKeyId,
          nonce: a.nonce,
        })),
      };
    }),
  );

  return enriched;
}

// ---------------------------------------------------------------------------
// Pin / Unpin
// ---------------------------------------------------------------------------

/**
 * Pin a message in a channel. Publishes a MESSAGE_PINNED event via Redis.
 *
 * @param messageId - Message UUID to pin.
 * @param channelId - Channel UUID the message belongs to.
 * @param authUserId - User performing the pin action.
 * @param authDeviceId - Device performing the pin action.
 */
export async function pinMessage(
  messageId: string,
  channelId: string,
  authUserId: string,
  authDeviceId: string,
): Promise<void> {
  const message = await messageRepo.findById(messageId);
  if (!message) throw ApiError.notFound('Message not found');
  if (message.channelId !== channelId) throw ApiError.badRequest('Message does not belong to this channel');
  if (message.deletedAt) throw ApiError.badRequest('Cannot pin a deleted message');
  if (message.pinnedAt) return; // Already pinned, idempotent

  await messageRepo.pin(messageId, authUserId);

  // Publish event for gateway fanout
  const pinnedAt = new Date().toISOString();
  try {
    await redis.publish(`ch:${channelId}`, JSON.stringify({
      type: 'MESSAGE_PINNED',
      data: { channelId, messageId, pinnedAt, pinnedByUserId: authUserId },
    }));
  } catch (err) {
    logger.error({ err, channelId, messageId }, 'Failed to publish pin event to Redis');
  }

  // Audit (fire-and-forget)
  auditRepo.create(
    authUserId,
    authDeviceId,
    AuditAction.MESSAGE_PINNED,
    'message',
    messageId,
    { channelId },
  ).catch((err: unknown) => {
    logger.error({ err }, 'Failed to create pin audit event');
  });
}

/**
 * Unpin a message in a channel. Publishes a MESSAGE_UNPINNED event via Redis.
 *
 * @param messageId - Message UUID to unpin.
 * @param channelId - Channel UUID the message belongs to.
 * @param authUserId - User performing the unpin action.
 * @param authDeviceId - Device performing the unpin action.
 */
export async function unpinMessage(
  messageId: string,
  channelId: string,
  authUserId: string,
  authDeviceId: string,
): Promise<void> {
  const message = await messageRepo.findById(messageId);
  if (!message) throw ApiError.notFound('Message not found');
  if (message.channelId !== channelId) throw ApiError.badRequest('Message does not belong to this channel');
  if (!message.pinnedAt) return; // Already unpinned, idempotent

  await messageRepo.unpin(messageId);

  // Publish event for gateway fanout
  try {
    await redis.publish(`ch:${channelId}`, JSON.stringify({
      type: 'MESSAGE_UNPINNED',
      data: { channelId, messageId },
    }));
  } catch (err) {
    logger.error({ err, channelId, messageId }, 'Failed to publish unpin event to Redis');
  }

  // Audit (fire-and-forget)
  auditRepo.create(
    authUserId,
    authDeviceId,
    AuditAction.MESSAGE_UNPINNED,
    'message',
    messageId,
    { channelId },
  ).catch((err: unknown) => {
    logger.error({ err }, 'Failed to create unpin audit event');
  });
}

/**
 * Fetch all pinned messages in a channel, enriched with attachments.
 *
 * @param channelId - Channel UUID.
 * @returns Array of pinned messages with attachment data.
 */
export async function getPinnedMessages(channelId: string) {
  const messages = await messageRepo.findPinnedByChannel(channelId);
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
          contentTypeEncrypted: a.contentTypeEncrypted,
          encryptionKeyId: a.encryptionKeyId,
          nonce: a.nonce,
        })),
      };
    }),
  );

  return enriched;
}
