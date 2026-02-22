import { Router, type Request, type Response, type NextFunction } from 'express';
import { verify } from 'argon2';
import { transaction } from '@ripcord/db';
import { ApiError, AuditAction, PasswordLoginSchema, type ApiResponse, type AuthResponse } from '@ripcord/types';
import { rateLimit } from '../middleware/rate-limit.js';
import * as userRepo from '../repositories/user.repo.js';
import * as deviceRepo from '../repositories/device.repo.js';
import * as auditRepo from '../repositories/audit.repo.js';
import * as sessionService from '../services/session.service.js';
import { logger } from '../logger.js';

export const passwordLoginRouter: Router = Router();

// Rate limit: 10 login attempts per minute per IP
const loginLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  keyPrefix: 'pw-login',
});

/**
 * POST /v1/auth/password/login
 *
 * Authenticate with handle + password. Single-step — no begin/finish
 * ceremony like WebAuthn.
 *
 * Request body: { handle, password, pubIdentityKey, deviceName? }
 * Response: { ok: true, data: AuthResponse }
 */
passwordLoginRouter.post(
  '/',
  loginLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = PasswordLoginSchema.safeParse(req.body);
      if (!parsed.success) {
        throw ApiError.badRequest(
          'Invalid login data',
          parsed.error.flatten().fieldErrors,
        );
      }

      const { handle, password, pubIdentityKey, deviceName } = parsed.data;

      // Look up user with password hash
      const user = await userRepo.findByHandleWithPassword(handle);
      if (!user || !user.password_hash) {
        // Generic error to avoid user enumeration
        throw ApiError.unauthorized('Invalid credentials');
      }

      // Verify password against stored argon2id hash
      const valid = await verify(user.password_hash, password);
      if (!valid) {
        throw ApiError.unauthorized('Invalid credentials');
      }

      // Find or create the device (same pattern as passkey login)
      let device = await deviceRepo.findByUserIdAndKey(user.id, pubIdentityKey);
      if (!device) {
        device = await transaction(async (client) => {
          return deviceRepo.create(
            client,
            user.id,
            deviceName ?? 'Unknown Device',
            pubIdentityKey,
          );
        });
      }

      // Create a new session
      const result = await sessionService.createSession(user.id, device.id);

      // Audit: user logged in via password
      await auditRepo.create(
        user.id,
        device.id,
        AuditAction.USER_LOGIN,
        'user',
        user.id,
        { handle, method: 'password' },
      );

      logger.info({ userId: user.id, handle }, 'User logged in (password)');

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
