import { Router, type Request, type Response, type NextFunction } from 'express';
import { ApiError, type ApiResponse } from '@ripcord/types';
import { requireAuth } from '../middleware/require-auth.js';
import * as relRepo from '../repositories/relationship.repo.js';
import { redis } from '../redis.js';

export const relationshipRouter: Router = Router();

// ---------------------------------------------------------------------------
// GET /v1/relationships/friends — list accepted friends
// ---------------------------------------------------------------------------

relationshipRouter.get(
  '/friends',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const friends = await relRepo.listFriends(auth.sub);
      const body: ApiResponse<typeof friends> = { ok: true, data: friends };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /v1/relationships/pending — list incoming and outgoing requests
// ---------------------------------------------------------------------------

relationshipRouter.get(
  '/pending',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const [incoming, outgoing] = await Promise.all([
        relRepo.listPendingIncoming(auth.sub),
        relRepo.listPendingOutgoing(auth.sub),
      ]);
      const body: ApiResponse<{ incoming: typeof incoming; outgoing: typeof outgoing }> = {
        ok: true,
        data: { incoming, outgoing },
      };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /v1/relationships/blocked — list blocked users
// ---------------------------------------------------------------------------

relationshipRouter.get(
  '/blocked',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const blocked = await relRepo.listBlocked(auth.sub);
      const body: ApiResponse<typeof blocked> = { ok: true, data: blocked };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /v1/relationships/request — send a friend request
// ---------------------------------------------------------------------------

relationshipRouter.post(
  '/request',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const { targetUserId } = req.body as { targetUserId?: string };

      if (!targetUserId || typeof targetUserId !== 'string') {
        throw ApiError.badRequest('targetUserId is required');
      }
      if (targetUserId === auth.sub) {
        throw ApiError.badRequest('Cannot send a friend request to yourself');
      }

      await relRepo.sendRequest(auth.sub, targetUserId);

      // Notify the target user in real-time via Redis → gateway
      await redis.publish(`user:${targetUserId}`, JSON.stringify({
        type: 'RELATIONSHIP_UPDATE',
        data: { fromUserId: auth.sub, action: 'request_received' },
      })).catch(() => {});

      const body: ApiResponse<null> = { ok: true };
      res.status(200).json(body);
    } catch (err) {
      if (err instanceof Error) {
        if (err.message === 'BLOCKED') {
          return next(ApiError.forbidden('Cannot send a friend request to this user'));
        }
        if (err.message === 'ALREADY_PENDING') {
          return next(ApiError.badRequest('Friend request already pending'));
        }
        if (err.message === 'ALREADY_FRIENDS') {
          return next(ApiError.badRequest('Already friends with this user'));
        }
      }
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /v1/relationships/accept — accept a friend request
// ---------------------------------------------------------------------------

relationshipRouter.post(
  '/accept',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const { userId } = req.body as { userId?: string };

      if (!userId || typeof userId !== 'string') {
        throw ApiError.badRequest('userId is required');
      }

      await relRepo.acceptRequest(auth.sub, userId);

      // Notify the original requester that their request was accepted
      await redis.publish(`user:${userId}`, JSON.stringify({
        type: 'RELATIONSHIP_UPDATE',
        data: { fromUserId: auth.sub, action: 'accepted' },
      })).catch(() => {});

      const body: ApiResponse<null> = { ok: true };
      res.status(200).json(body);
    } catch (err) {
      if (err instanceof Error && err.message === 'NO_PENDING_REQUEST') {
        return next(ApiError.badRequest('No pending friend request from this user'));
      }
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /v1/relationships/decline — decline a friend request
// ---------------------------------------------------------------------------

relationshipRouter.post(
  '/decline',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const { userId } = req.body as { userId?: string };

      if (!userId || typeof userId !== 'string') {
        throw ApiError.badRequest('userId is required');
      }

      await relRepo.declineRequest(auth.sub, userId);

      const body: ApiResponse<null> = { ok: true };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// DELETE /v1/relationships/friends/:userId — remove a friend
// ---------------------------------------------------------------------------

relationshipRouter.delete(
  '/friends/:userId',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const userId = req.params.userId as string;

      if (!userId) throw ApiError.badRequest('userId is required');

      await relRepo.removeFriend(auth.sub, userId);

      // Notify the other user
      await redis.publish(`user:${userId}`, JSON.stringify({
        type: 'RELATIONSHIP_UPDATE',
        data: { fromUserId: auth.sub, action: 'removed' },
      })).catch(() => {});

      const body: ApiResponse<null> = { ok: true };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /v1/relationships/block — block a user
// ---------------------------------------------------------------------------

relationshipRouter.post(
  '/block',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const { targetUserId } = req.body as { targetUserId?: string };

      if (!targetUserId || typeof targetUserId !== 'string') {
        throw ApiError.badRequest('targetUserId is required');
      }
      if (targetUserId === auth.sub) {
        throw ApiError.badRequest('Cannot block yourself');
      }

      await relRepo.blockUser(auth.sub, targetUserId);

      const body: ApiResponse<null> = { ok: true };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// DELETE /v1/relationships/block/:userId — unblock a user
// ---------------------------------------------------------------------------

relationshipRouter.delete(
  '/block/:userId',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const userId = req.params.userId as string;

      if (!userId) throw ApiError.badRequest('userId is required');

      await relRepo.unblockUser(auth.sub, userId);

      const body: ApiResponse<null> = { ok: true };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);
