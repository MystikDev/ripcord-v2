/**
 * @module verify-email
 * Routes for email verification during registration.
 *
 * POST /v1/auth/verify-email        — Validate 6-digit code, activate user, return tokens
 * POST /v1/auth/verify-email/resend — Resend a new verification code (rate-limited)
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { transaction } from '@ripcord/db';
import {
  ApiError,
  AuditAction,
  VerifyEmailSchema,
  ResendCodeSchema,
  type ApiResponse,
  type AuthResponse,
  type PendingVerificationResponse,
} from '@ripcord/types';
import { rateLimit } from '../middleware/rate-limit.js';
import * as userRepo from '../repositories/user.repo.js';
import * as deviceRepo from '../repositories/device.repo.js';
import * as auditRepo from '../repositories/audit.repo.js';
import * as sessionService from '../services/session.service.js';
import * as verificationService from '../services/verification.service.js';
import * as emailService from '../services/email.service.js';
import { redis } from '../redis.js';
import { logger } from '../logger.js';

export const verifyEmailRouter: Router = Router();

// ---------------------------------------------------------------------------
// Rate limiters
// ---------------------------------------------------------------------------

const verifyLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  keyPrefix: 'verify-email',
});

const resendLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  keyPrefix: 'verify-resend',
});

// ---------------------------------------------------------------------------
// POST /v1/auth/verify-email
// ---------------------------------------------------------------------------

/**
 * Validate a 6-digit verification code.
 *
 * On success: activates the user, creates device + session from the
 * pending registration data stored in Redis, and returns full auth tokens.
 */
verifyEmailRouter.post(
  '/',
  verifyLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = VerifyEmailSchema.safeParse(req.body);
      if (!parsed.success) {
        throw ApiError.badRequest(
          'Invalid verification data',
          parsed.error.flatten().fieldErrors,
        );
      }

      const { userId, code } = parsed.data;

      // Verify the code
      const valid = await verificationService.verifyCode(userId, code);
      if (!valid) {
        throw ApiError.badRequest('Invalid or expired verification code');
      }

      // Fetch user — must exist and be pending
      const user = await userRepo.findById(userId);
      if (!user) {
        throw ApiError.notFound('User not found');
      }
      if (user.status !== 'pending_verification') {
        throw ApiError.badRequest('Account is already verified');
      }

      // Retrieve pending registration data from Redis
      const pendingRaw = await redis.get(`pending-reg:${userId}`);
      if (!pendingRaw) {
        throw ApiError.badRequest(
          'Registration data expired. Please register again.',
        );
      }

      const pending = JSON.parse(pendingRaw) as {
        pubIdentityKey: string;
        deviceName: string;
      };

      // Activate user + create device in a transaction
      const { device } = await transaction(async (client) => {
        await userRepo.updateStatus(client, userId, 'active');
        const newDevice = await deviceRepo.create(
          client,
          userId,
          pending.deviceName,
          pending.pubIdentityKey,
        );
        return { device: newDevice };
      });

      // Create session (issues tokens)
      const result = await sessionService.createSession(userId, device.id);

      // Clean up Redis pending data
      await redis.del(`pending-reg:${userId}`);

      // Audit: email verified
      await auditRepo.create(
        userId,
        device.id,
        AuditAction.EMAIL_VERIFIED,
        'user',
        userId,
        { method: 'code' },
      );

      logger.info({ userId, handle: user.handle }, 'Email verified — account activated');

      const authResponse: AuthResponse = {
        tokenPair: result.tokenPair,
        session: result.session,
        user: {
          id: user.id,
          handle: user.handle,
          avatarUrl: user.avatar_url ?? undefined,
        },
      };

      const body: ApiResponse<AuthResponse> = { ok: true, data: authResponse };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /v1/auth/verify-email/resend
// ---------------------------------------------------------------------------

/**
 * Resend a verification code to the user's email.
 *
 * Rate-limited: 60s cooldown between resends, max 3 resends per window.
 */
verifyEmailRouter.post(
  '/resend',
  resendLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = ResendCodeSchema.safeParse(req.body);
      if (!parsed.success) {
        throw ApiError.badRequest(
          'Invalid request',
          parsed.error.flatten().fieldErrors,
        );
      }

      const { userId } = parsed.data;

      // Fetch user — must exist and still be pending
      const user = await userRepo.findById(userId);
      if (!user) {
        throw ApiError.notFound('User not found');
      }
      if (user.status !== 'pending_verification') {
        throw ApiError.badRequest('Account is already verified');
      }

      // Get the user's email from DB
      const email = await userRepo.getEmail(userId);
      if (!email) {
        throw ApiError.badRequest('No email on file for this user');
      }

      // Generate a new code (respects cooldown + max resends)
      const result = await verificationService.resendCode(userId);
      if ('error' in result) {
        throw ApiError.tooManyRequests(result.error);
      }

      // Send the new code
      await emailService.sendVerificationCode(email, result.code);

      // Audit: code resent
      await auditRepo.create(
        userId,
        null,
        AuditAction.VERIFICATION_RESENT,
        'user',
        userId,
        {},
      );

      logger.debug({ userId }, 'Verification code resent');

      const body: ApiResponse<{ message: string }> = {
        ok: true,
        data: { message: 'Verification code sent' },
      };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);
