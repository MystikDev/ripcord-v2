import { Router, type Request, type Response, type NextFunction } from 'express';
import { ApiError, RefreshRequestSchema, type ApiResponse, type AuthResponse } from '@ripcord/types';
import { rateLimit } from '../middleware/rate-limit.js';
import * as sessionService from '../services/session.service.js';
import * as userRepo from '../repositories/user.repo.js';

export const refreshRouter: Router = Router();

// Rate limit: 30 refreshes per minute per IP (high to support concurrent tabs)
const refreshLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  keyPrefix: 'refresh',
});

/**
 * POST /v1/auth/refresh
 *
 * Exchange a valid refresh token for a new token pair. The old refresh
 * token is consumed and a rotated replacement is returned.
 *
 * Implements refresh-token rotation with family-based reuse detection.
 * If a previously consumed token is replayed, the entire token family
 * is revoked as a precaution against token theft.
 *
 * Request body: { refreshToken: string }
 * Response: { ok: true, data: AuthResponse }
 */
refreshRouter.post(
  '/',
  refreshLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request body
      const parsed = RefreshRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw ApiError.badRequest(
          'Invalid refresh request',
          parsed.error.flatten().fieldErrors,
        );
      }

      const result = await sessionService.refreshSession(parsed.data.refreshToken);

      // Look up user for the response
      const user = await userRepo.findById(result.session.userId);
      if (!user) {
        throw ApiError.unauthorized('User not found');
      }

      const authResponse: AuthResponse = {
        tokenPair: result.tokenPair,
        session: result.session,
        user: { id: user.id, handle: user.handle, avatarUrl: user.avatar_url ?? undefined },
      };

      const body: ApiResponse<AuthResponse> = { ok: true, data: authResponse };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);
