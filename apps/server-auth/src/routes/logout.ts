import { Router, type Request, type Response, type NextFunction } from 'express';
import { AuditAction, type ApiResponse } from '@ripcord/types';
import { rateLimit } from '../middleware/rate-limit.js';
import { requireAuth } from '../middleware/require-auth.js';
import * as sessionService from '../services/session.service.js';
import * as auditRepo from '../repositories/audit.repo.js';
import { logger } from '../logger.js';

export const logoutRouter: Router = Router();

// Rate limit: 10 logouts per minute per IP
const logoutLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  keyPrefix: 'logout',
});

/**
 * POST /v1/auth/logout
 *
 * Revoke the caller's current session. Requires a valid access token
 * in the Authorization header.
 *
 * Request body: (empty or { sessionId?: string })
 * Response: { ok: true, data: { message: "Logged out" } }
 */
logoutRouter.post(
  '/',
  logoutLimiter,
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const sessionId = auth.sid;

      await sessionService.revokeSession(sessionId, auth.sub, auth.did);

      // Audit: user logged out
      await auditRepo.create(
        auth.sub,
        auth.did,
        AuditAction.USER_LOGOUT,
        'session',
        sessionId,
        {},
      );

      logger.info({ userId: auth.sub, sessionId }, 'User logged out');

      const body: ApiResponse = { ok: true, data: { message: 'Logged out' } };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);
