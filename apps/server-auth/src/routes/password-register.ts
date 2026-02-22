import { Router, type Request, type Response, type NextFunction } from 'express';
import { hash } from 'argon2';
import { transaction } from '@ripcord/db';
import { ApiError, AuditAction, PasswordRegisterSchema, type ApiResponse, type AuthResponse } from '@ripcord/types';
import { rateLimit } from '../middleware/rate-limit.js';
import * as userRepo from '../repositories/user.repo.js';
import * as deviceRepo from '../repositories/device.repo.js';
import * as auditRepo from '../repositories/audit.repo.js';
import * as sessionService from '../services/session.service.js';
import { logger } from '../logger.js';

export const passwordRegisterRouter: Router = Router();

// Rate limit: 5 registrations per minute per IP (tighter than passkey)
const registrationLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  keyPrefix: 'pw-register',
});

/**
 * POST /v1/auth/password/register
 *
 * Register a new account with a password. Single-step — no begin/finish
 * ceremony like WebAuthn. Creates user, device, and session in one go.
 *
 * Request body: { handle, password, pubIdentityKey, deviceName? }
 * Response: { ok: true, data: AuthResponse }
 */
passwordRegisterRouter.post(
  '/',
  registrationLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = PasswordRegisterSchema.safeParse(req.body);
      if (!parsed.success) {
        throw ApiError.badRequest(
          'Invalid registration data',
          parsed.error.flatten().fieldErrors,
        );
      }

      const { handle, password, pubIdentityKey, deviceName } = parsed.data;

      // Hash password with argon2id (OWASP defaults)
      const passwordHash = await hash(password);

      // Single transaction: create user + device
      const { user, device } = await transaction(async (client) => {
        // Double-check uniqueness inside transaction
        const existingUser = await client.query(
          'SELECT id FROM users WHERE handle = $1 FOR UPDATE',
          [handle],
        );
        if (existingUser.rows.length > 0) {
          throw ApiError.conflict('Handle is already taken');
        }

        const newUser = await userRepo.createWithPassword(client, handle, passwordHash);
        const newDevice = await deviceRepo.create(
          client,
          newUser.id,
          deviceName ?? 'Default Device',
          pubIdentityKey,
        );

        return { user: newUser, device: newDevice };
      });

      // Create the initial session (reuses existing infrastructure)
      const result = await sessionService.createSession(user.id, device.id);

      // Audit: user registered via password
      await auditRepo.create(
        user.id,
        device.id,
        AuditAction.USER_REGISTER,
        'user',
        user.id,
        { handle, method: 'password' },
      );

      logger.info({ userId: user.id, handle }, 'New user registered (password)');

      const authResponse: AuthResponse = {
        tokenPair: result.tokenPair,
        session: result.session,
        user: { id: user.id, handle: user.handle, avatarUrl: user.avatar_url ?? undefined },
      };

      const body: ApiResponse<AuthResponse> = { ok: true, data: authResponse };
      res.status(201).json(body);
    } catch (err) {
      next(err);
    }
  },
);
