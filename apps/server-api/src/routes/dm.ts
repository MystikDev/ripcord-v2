import { Router, type Request, type Response, type NextFunction } from 'express';
import { ApiError, type ApiResponse } from '@ripcord/types';
import { requireAuth } from '../middleware/require-auth.js';
import * as dmRepo from '../repositories/dm.repo.js';
import type { DmChannel } from '../repositories/dm.repo.js';

export const dmRouter: Router = Router();

/**
 * POST /v1/dm/channels
 *
 * Create or retrieve a DM channel between the current user and another user.
 *
 * Body: { targetUserId: string }
 * Response: { ok: true, data: { channelId: string } }
 */
dmRouter.post(
  '/channels',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const { targetUserId } = req.body as { targetUserId?: string };

      if (!targetUserId || typeof targetUserId !== 'string') {
        throw ApiError.badRequest('targetUserId is required');
      }

      if (targetUserId === auth.sub) {
        throw ApiError.badRequest('Cannot create a DM with yourself');
      }

      const channelId = await dmRepo.findOrCreate(auth.sub, targetUserId);

      const body: ApiResponse<{ channelId: string }> = { ok: true, data: { channelId } };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /v1/dm/channels
 *
 * List all DM channels for the current user with participant info.
 *
 * Response: { ok: true, data: DmChannel[] }
 */
dmRouter.get(
  '/channels',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const channels = await dmRepo.listByUser(auth.sub);

      const body: ApiResponse<DmChannel[]> = { ok: true, data: channels };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);
