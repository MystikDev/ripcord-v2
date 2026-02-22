import { Router, type Request, type Response, type NextFunction } from 'express';
import { ApiError, type ApiResponse, type SessionInfo } from '@ripcord/types';
import { requireAuth } from '../middleware/require-auth.js';
import * as sessionService from '../services/session.service.js';
import * as sessionRepo from '../repositories/session.repo.js';
import { logger } from '../logger.js';

export const sessionsRouter: Router = Router();

/**
 * GET /v1/auth/sessions
 *
 * Returns all active (non-revoked, non-expired) sessions for the
 * currently authenticated user. Useful for "active sessions" UI
 * where users can review and revoke sessions on other devices.
 *
 * Response: { ok: true, data: SessionInfo[] }
 */
sessionsRouter.get(
  '/',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const sessions = await sessionService.getActiveSessions(auth.sub);

      const body: ApiResponse<SessionInfo[]> = { ok: true, data: sessions };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /v1/auth/sessions/:id
 *
 * Revoke a specific session. The session must belong to the currently
 * authenticated user (no cross-user session revocation).
 *
 * Response: { ok: true, data: { message: "Session revoked" } }
 */
sessionsRouter.delete(
  '/:id',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const targetSessionId = req.params['id'] as string | undefined;

      if (!targetSessionId) {
        throw ApiError.badRequest('Session ID is required');
      }

      // Verify the session belongs to the authenticated user
      const sessions = await sessionRepo.findActiveByUserId(auth.sub);
      const targetSession = sessions.find((s) => s.id === targetSessionId);

      if (!targetSession) {
        throw ApiError.notFound('Session not found or does not belong to you');
      }

      await sessionService.revokeSession(targetSessionId, auth.sub, auth.did);

      logger.info(
        { userId: auth.sub, sessionId: targetSessionId },
        'Session revoked by user',
      );

      const body: ApiResponse = { ok: true, data: { message: 'Session revoked' } };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);
