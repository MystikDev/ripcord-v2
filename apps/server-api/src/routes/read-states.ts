import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { Permission } from '@ripcord/types';
import type { ApiResponse } from '@ripcord/types';
import { ApiError } from '@ripcord/types';
import { requireAuth } from '../middleware/require-auth.js';
import { validate } from '../middleware/validate.js';
import * as readStateRepo from '../repositories/read-state.repo.js';
import * as channelRepo from '../repositories/channel.repo.js';
import * as memberRepo from '../repositories/member.repo.js';
import * as permissionService from '../services/permission.service.js';
import type { ReadState } from '../repositories/read-state.repo.js';

export const readStatesRouter: Router = Router({ mergeParams: true });

const ReadStateBodySchema = z.object({
  lastReadMessageId: z.string().uuid(),
});

/**
 * PUT /v1/channels/:channelId/read-state
 *
 * Mark a channel as read up to a specific message.
 * Body: { lastReadMessageId: string }
 */
readStatesRouter.put(
  '/channels/:channelId/read-state',
  requireAuth,
  validate(ReadStateBodySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const channelId = req.params['channelId'] as string | undefined;
      if (!channelId) throw ApiError.badRequest('channelId is required');

      // Verify channel exists
      const channel = await channelRepo.findById(channelId);
      if (!channel) throw ApiError.notFound('Channel not found');
      if (!channel.hubId) throw ApiError.badRequest('Channel is not part of a hub');

      // Verify membership
      const membership = await memberRepo.findOne(channel.hubId, auth.sub);
      if (!membership) throw ApiError.forbidden('Not a member of this hub');

      // Check VIEW_CHANNELS permission
      const canView = await permissionService.checkPermission(
        channel.hubId, channelId, auth.sub, Permission.VIEW_CHANNELS,
      );
      if (!canView) throw ApiError.forbidden('Missing VIEW_CHANNELS permission');

      const { lastReadMessageId } = req.body as { lastReadMessageId: string };
      const readState = await readStateRepo.upsert(auth.sub, channelId, lastReadMessageId);
      const body: ApiResponse<ReadState> = { ok: true, data: readState };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /v1/read-states
 *
 * Fetch all read states for the current user.
 */
readStatesRouter.get(
  '/read-states',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const readStates = await readStateRepo.findByUser(auth.sub);
      const body: ApiResponse<ReadState[]> = { ok: true, data: readStates };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);
