import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  ApiError,
  type ApiResponse,
  type Channel,
  CreateChannelSchema,
  Permission,
  AuditAction,
} from '@ripcord/types';
import { requireAuth } from '../middleware/require-auth.js';
import { validate } from '../middleware/validate.js';
import * as channelRepo from '../repositories/channel.repo.js';
import * as memberRepo from '../repositories/member.repo.js';
import * as hubRepo from '../repositories/server.repo.js';
import * as auditRepo from '../repositories/audit.repo.js';
import * as permissionService from '../services/permission.service.js';
import { logger } from '../logger.js';

export const channelsRouter: Router = Router({ mergeParams: true });

/**
 * POST /v1/hubs/:hubId/channels
 *
 * Create a new channel in a hub. Requires MANAGE_CHANNELS permission.
 *
 * Body: { name: string, type: "text" | "voice" }
 * Response: { ok: true, data: Channel }
 */
channelsRouter.post(
  '/',
  requireAuth,
  validate(CreateChannelSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const hubId = req.params['hubId'] as string | undefined;
      const { name, type } = req.body as { name: string; type: 'text' | 'voice' };

      if (!hubId) {
        throw ApiError.badRequest('Hub ID is required');
      }

      // Verify hub exists
      const hub = await hubRepo.findById(hubId);
      if (!hub) {
        throw ApiError.notFound('Hub not found');
      }

      // Verify membership
      const membership = await memberRepo.findOne(hubId, auth.sub);
      if (!membership) {
        throw ApiError.forbidden('You are not a member of this hub');
      }

      // Check MANAGE_CHANNELS permission using any existing channel
      const existingChannels = await channelRepo.findByHubId(hubId);
      const refChannel = existingChannels[0];
      if (refChannel) {
        const hasPerm = await permissionService.checkPermission(
          hubId,
          refChannel.id,
          auth.sub,
          Permission.MANAGE_CHANNELS,
        );
        if (!hasPerm) {
          throw ApiError.forbidden('Missing MANAGE_CHANNELS permission');
        }
      }

      const channel = await channelRepo.create(hubId, name, type);

      // Invalidate permission cache for the hub since a new channel was created
      await permissionService.invalidatePermissions(hubId);

      // Audit event
      auditRepo.create(
        auth.sub,
        auth.did,
        AuditAction.CHANNEL_CREATED,
        'channel',
        channel.id,
        { name, type, hubId },
        hubId,
      ).catch((err: unknown) => {
        logger.error({ err }, 'Failed to create channel audit event');
      });

      logger.info({ channelId: channel.id, hubId }, 'Channel created');

      const body: ApiResponse<Channel> = { ok: true, data: channel };
      res.status(201).json(body);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /v1/hubs/:hubId/channels
 *
 * List all channels in a hub. Filters out channels the caller
 * does not have VIEW_CHANNELS permission for.
 *
 * Response: { ok: true, data: Channel[] }
 */
channelsRouter.get(
  '/',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const hubId = req.params['hubId'] as string | undefined;

      if (!hubId) {
        throw ApiError.badRequest('Hub ID is required');
      }

      // Verify membership
      const membership = await memberRepo.findOne(hubId, auth.sub);
      if (!membership) {
        throw ApiError.forbidden('You are not a member of this hub');
      }

      const allChannels = await channelRepo.findByHubId(hubId);

      // Filter channels by VIEW_CHANNELS permission
      const visibleChannels: Channel[] = [];
      for (const channel of allChannels) {
        const canView = await permissionService.checkPermission(
          hubId,
          channel.id,
          auth.sub,
          Permission.VIEW_CHANNELS,
        );
        if (canView) {
          visibleChannels.push(channel);
        }
      }

      const body: ApiResponse<Channel[]> = { ok: true, data: visibleChannels };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);
