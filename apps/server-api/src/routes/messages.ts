import { Router, type Request, type Response, type NextFunction } from 'express';
import { ApiError, type ApiResponse, Permission } from '@ripcord/types';
import { requireAuth } from '../middleware/require-auth.js';
import { rateLimit } from '../middleware/rate-limit.js';
import * as messageService from '../services/message.service.js';
import * as channelRepo from '../repositories/channel.repo.js';
import * as memberRepo from '../repositories/member.repo.js';
import * as dmRepo from '../repositories/dm.repo.js';
import * as permissionService from '../services/permission.service.js';
import * as messageRepo from '../repositories/message.repo.js';
import type { Message } from '../repositories/message.repo.js';

export const messagesRouter: Router = Router();

const messageSendLimiter = rateLimit({
  windowMs: 10_000,
  max: 10,
  keyPrefix: 'rl:msg-send',
  keyExtractor: (req) => req.auth?.sub ?? 'anon',
});

/**
 * POST /v1/messages/send
 *
 * Send an encrypted message envelope. The envelope is validated with Zod,
 * persisted to the database, and published to Redis for gateway fanout.
 *
 * Requires SEND_MESSAGES permission in the target channel.
 *
 * Body: EncryptedEnvelope
 * Response: { ok: true, data: Message }
 */
messagesRouter.post(
  '/send',
  requireAuth,
  messageSendLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const envelope = req.body as Record<string, unknown>;

      // Extract channelId from envelope for permission check
      const channelId = envelope['channelId'];
      if (typeof channelId !== 'string') {
        throw ApiError.badRequest('channelId is required in envelope');
      }

      // Verify channel exists and get hub context
      const channel = await channelRepo.findById(channelId);
      if (!channel) {
        throw ApiError.notFound('Channel not found');
      }

      if (channel.hubId === null) {
        // DM channel — verify caller is a participant
        const isDmParticipant = await dmRepo.isParticipant(channelId, auth.sub);
        if (!isDmParticipant) {
          throw ApiError.forbidden('You are not a participant in this DM');
        }
      } else {
        // Hub channel — verify membership + SEND_MESSAGES permission
        const membership = await memberRepo.findOne(channel.hubId, auth.sub);
        if (!membership) {
          throw ApiError.forbidden('You are not a member of this hub');
        }

        const hasPerm = await permissionService.checkPermission(
          channel.hubId,
          channelId,
          auth.sub,
          Permission.SEND_MESSAGES,
        );
        if (!hasPerm) {
          throw ApiError.forbidden('Missing SEND_MESSAGES permission');
        }
      }

      const message = await messageService.sendMessage(envelope, auth.sub, auth.did);

      const body: ApiResponse<Message> = { ok: true, data: message };
      res.status(201).json(body);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /v1/channels/:channelId/messages
 *
 * Fetch messages from a channel with cursor-based pagination.
 * Requires VIEW_CHANNELS permission.
 *
 * Query params:
 *   cursor - Optional message ID to paginate from
 *   limit  - Number of messages (default 50, max 100)
 *
 * Response: { ok: true, data: Message[] }
 */
messagesRouter.get(
  '/channels/:channelId/messages',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const channelId = req.params['channelId'] as string | undefined;

      if (!channelId) {
        throw ApiError.badRequest('Channel ID is required');
      }

      // Verify channel exists
      const channel = await channelRepo.findById(channelId);
      if (!channel) {
        throw ApiError.notFound('Channel not found');
      }

      if (channel.hubId === null) {
        // DM channel — verify caller is a participant
        const isDmParticipant = await dmRepo.isParticipant(channelId, auth.sub);
        if (!isDmParticipant) {
          throw ApiError.forbidden('You are not a participant in this DM');
        }
      } else {
        // Hub channel — verify membership + VIEW_CHANNELS permission
        const membership = await memberRepo.findOne(channel.hubId, auth.sub);
        if (!membership) {
          throw ApiError.forbidden('You are not a member of this hub');
        }

        const hasPerm = await permissionService.checkPermission(
          channel.hubId,
          channelId,
          auth.sub,
          Permission.VIEW_CHANNELS,
        );
        if (!hasPerm) {
          throw ApiError.forbidden('Missing VIEW_CHANNELS permission');
        }
      }

      const cursor = req.query['cursor'] as string | undefined;
      const limitParam = req.query['limit'] as string | undefined;
      const limit = limitParam ? Number(limitParam) : undefined;

      const messages = await messageService.getMessages(channelId, cursor, limit);

      const body: ApiResponse<Message[]> = { ok: true, data: messages };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// Pin / Unpin
// ---------------------------------------------------------------------------

/**
 * POST /v1/channels/:channelId/messages/:messageId/pin
 *
 * Pin a message in a channel.
 * Requires MANAGE_MESSAGES permission OR being the message author.
 *
 * Response: { ok: true }
 */
messagesRouter.post(
  '/channels/:channelId/messages/:messageId/pin',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const channelId = req.params['channelId'] as string | undefined;
      const messageId = req.params['messageId'] as string | undefined;

      if (!channelId) throw ApiError.badRequest('Channel ID is required');
      if (!messageId) throw ApiError.badRequest('Message ID is required');

      // Verify channel exists
      const channel = await channelRepo.findById(channelId);
      if (!channel) throw ApiError.notFound('Channel not found');

      // Verify the message exists and belongs to this channel
      const message = await messageRepo.findById(messageId);
      if (!message || message.channelId !== channelId) {
        throw ApiError.notFound('Message not found in this channel');
      }

      if (channel.hubId === null) {
        // DM channel — any participant can pin
        const isDmParticipant = await dmRepo.isParticipant(channelId, auth.sub);
        if (!isDmParticipant) {
          throw ApiError.forbidden('You are not a participant in this DM');
        }
      } else {
        // Hub channel — must have MANAGE_MESSAGES or be the author
        const membership = await memberRepo.findOne(channel.hubId, auth.sub);
        if (!membership) throw ApiError.forbidden('You are not a member of this hub');

        const isAuthor = message.senderUserId === auth.sub;
        if (!isAuthor) {
          const hasPerm = await permissionService.checkPermission(
            channel.hubId,
            channelId,
            auth.sub,
            Permission.MANAGE_MESSAGES,
          );
          if (!hasPerm) {
            throw ApiError.forbidden('Missing MANAGE_MESSAGES permission');
          }
        }
      }

      await messageService.pinMessage(messageId, channelId, auth.sub, auth.did);

      const body: ApiResponse<null> = { ok: true, data: null };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /v1/channels/:channelId/messages/:messageId/pin
 *
 * Unpin a message from a channel.
 * Requires MANAGE_MESSAGES permission OR being the message author.
 *
 * Response: { ok: true }
 */
messagesRouter.delete(
  '/channels/:channelId/messages/:messageId/pin',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const channelId = req.params['channelId'] as string | undefined;
      const messageId = req.params['messageId'] as string | undefined;

      if (!channelId) throw ApiError.badRequest('Channel ID is required');
      if (!messageId) throw ApiError.badRequest('Message ID is required');

      const channel = await channelRepo.findById(channelId);
      if (!channel) throw ApiError.notFound('Channel not found');

      const message = await messageRepo.findById(messageId);
      if (!message || message.channelId !== channelId) {
        throw ApiError.notFound('Message not found in this channel');
      }

      if (channel.hubId === null) {
        const isDmParticipant = await dmRepo.isParticipant(channelId, auth.sub);
        if (!isDmParticipant) {
          throw ApiError.forbidden('You are not a participant in this DM');
        }
      } else {
        const membership = await memberRepo.findOne(channel.hubId, auth.sub);
        if (!membership) throw ApiError.forbidden('You are not a member of this hub');

        const isAuthor = message.senderUserId === auth.sub;
        if (!isAuthor) {
          const hasPerm = await permissionService.checkPermission(
            channel.hubId,
            channelId,
            auth.sub,
            Permission.MANAGE_MESSAGES,
          );
          if (!hasPerm) {
            throw ApiError.forbidden('Missing MANAGE_MESSAGES permission');
          }
        }
      }

      await messageService.unpinMessage(messageId, channelId, auth.sub, auth.did);

      const body: ApiResponse<null> = { ok: true, data: null };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /v1/channels/:channelId/pins
 *
 * Fetch all pinned messages in a channel.
 * Requires VIEW_CHANNELS permission (hub) or DM participant.
 *
 * Response: { ok: true, data: Message[] }
 */
messagesRouter.get(
  '/channels/:channelId/pins',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const channelId = req.params['channelId'] as string | undefined;

      if (!channelId) throw ApiError.badRequest('Channel ID is required');

      const channel = await channelRepo.findById(channelId);
      if (!channel) throw ApiError.notFound('Channel not found');

      if (channel.hubId === null) {
        const isDmParticipant = await dmRepo.isParticipant(channelId, auth.sub);
        if (!isDmParticipant) {
          throw ApiError.forbidden('You are not a participant in this DM');
        }
      } else {
        const membership = await memberRepo.findOne(channel.hubId, auth.sub);
        if (!membership) throw ApiError.forbidden('You are not a member of this hub');

        const hasPerm = await permissionService.checkPermission(
          channel.hubId,
          channelId,
          auth.sub,
          Permission.VIEW_CHANNELS,
        );
        if (!hasPerm) throw ApiError.forbidden('Missing VIEW_CHANNELS permission');
      }

      const pinned = await messageService.getPinnedMessages(channelId);

      const body: ApiResponse<typeof pinned> = { ok: true, data: pinned };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);
