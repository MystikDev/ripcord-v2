/**
 * @module password-reset
 * Routes for the "forgot password" flow.
 *
 * POST /v1/auth/password-reset          — Request a reset code (by handle)
 * POST /v1/auth/password-reset/confirm  — Validate code + set new password
 * POST /v1/auth/password-reset/resend   — Resend the reset code (rate-limited)
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { hash } from 'argon2';
import {
  ApiError,
  AuditAction,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  ResendResetCodeSchema,
  type ApiResponse,
  type ForgotPasswordResponse,
} from '@ripcord/types';
import { rateLimit } from '../middleware/rate-limit.js';
import * as userRepo from '../repositories/user.repo.js';
import * as auditRepo from '../repositories/audit.repo.js';
import * as resetService from '../services/password-reset.service.js';
import * as emailService from '../services/email.service.js';
import { logger } from '../logger.js';

export const passwordResetRouter: Router = Router();

// ---------------------------------------------------------------------------
// Rate limiters
// ---------------------------------------------------------------------------

const requestLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  keyPrefix: 'pw-reset-request',
});

const confirmLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  keyPrefix: 'pw-reset-confirm',
});

const resendLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  keyPrefix: 'pw-reset-resend',
});

// ---------------------------------------------------------------------------
// POST / — Request a password reset code
// ---------------------------------------------------------------------------

/**
 * Look up the user by handle, send a 6-digit reset code to their email,
 * and return { userId, maskedEmail } so the frontend can show the code screen.
 *
 * To prevent user enumeration, we return a generic success even when the
 * handle is not found. However we skip the email send in that case.
 */
passwordResetRouter.post(
  '/',
  requestLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = ForgotPasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        throw ApiError.badRequest(
          'Invalid request',
          parsed.error.flatten().fieldErrors,
        );
      }

      const { handle } = parsed.data;

      // Look up user
      const user = await userRepo.findByHandle(handle);

      if (!user) {
        // Don't reveal whether the handle exists — return a plausible response
        logger.debug({ handle }, 'Password reset requested for unknown handle');
        const body: ApiResponse<ForgotPasswordResponse> = {
          ok: true,
          data: { userId: '00000000-0000-0000-0000-000000000000', maskedEmail: '***@***' },
        };
        res.json(body);
        return;
      }

      // Only active users can reset their password
      if (user.status !== 'active') {
        // Same generic response to prevent enumeration
        const body: ApiResponse<ForgotPasswordResponse> = {
          ok: true,
          data: { userId: '00000000-0000-0000-0000-000000000000', maskedEmail: '***@***' },
        };
        res.json(body);
        return;
      }

      // Get email
      const email = await userRepo.getEmail(user.id);
      if (!email) {
        // User exists but has no email on file (legacy user)
        const body: ApiResponse<ForgotPasswordResponse> = {
          ok: true,
          data: { userId: '00000000-0000-0000-0000-000000000000', maskedEmail: '***@***' },
        };
        res.json(body);
        return;
      }

      // Generate code and send email
      const code = await resetService.createResetCode(user.id);
      await emailService.sendPasswordResetCode(email, code);

      // Audit
      await auditRepo.create(
        user.id,
        null,
        AuditAction.PASSWORD_RESET_REQUESTED,
        'user',
        user.id,
        { handle },
      );

      logger.info({ userId: user.id, handle }, 'Password reset code sent');

      const body: ApiResponse<ForgotPasswordResponse> = {
        ok: true,
        data: {
          userId: user.id,
          maskedEmail: emailService.maskEmail(email),
        },
      };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /confirm — Validate code + set new password
// ---------------------------------------------------------------------------

passwordResetRouter.post(
  '/confirm',
  confirmLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = ResetPasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        throw ApiError.badRequest(
          'Invalid request',
          parsed.error.flatten().fieldErrors,
        );
      }

      const { userId, code, newPassword } = parsed.data;

      // Verify the reset code
      const valid = await resetService.verifyResetCode(userId, code);
      if (!valid) {
        throw ApiError.badRequest('Invalid or expired reset code');
      }

      // Fetch user
      const user = await userRepo.findById(userId);
      if (!user || user.status !== 'active') {
        throw ApiError.badRequest('Invalid or expired reset code');
      }

      // Hash new password and update
      const passwordHash = await hash(newPassword);
      await userRepo.updatePassword(userId, passwordHash);

      // Audit
      await auditRepo.create(
        userId,
        null,
        AuditAction.PASSWORD_CHANGED,
        'user',
        userId,
        { method: 'reset_code' },
      );

      logger.info({ userId, handle: user.handle }, 'Password changed via reset');

      const body: ApiResponse<{ message: string }> = {
        ok: true,
        data: { message: 'Password updated successfully' },
      };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /resend — Resend the reset code
// ---------------------------------------------------------------------------

passwordResetRouter.post(
  '/resend',
  resendLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = ResendResetCodeSchema.safeParse(req.body);
      if (!parsed.success) {
        throw ApiError.badRequest(
          'Invalid request',
          parsed.error.flatten().fieldErrors,
        );
      }

      const { userId } = parsed.data;

      // Fetch user
      const user = await userRepo.findById(userId);
      if (!user || user.status !== 'active') {
        throw ApiError.notFound('User not found');
      }

      // Get email
      const email = await userRepo.getEmail(userId);
      if (!email) {
        throw ApiError.badRequest('No email on file for this user');
      }

      // Generate new code (respects cooldown + max resends)
      const result = await resetService.resendResetCode(userId);
      if ('error' in result) {
        throw ApiError.tooManyRequests(result.error);
      }

      // Send the new code
      await emailService.sendPasswordResetCode(email, result.code);

      // Audit
      await auditRepo.create(
        userId,
        null,
        AuditAction.PASSWORD_RESET_REQUESTED,
        'user',
        userId,
        { resend: true },
      );

      logger.debug({ userId }, 'Password reset code resent');

      const body: ApiResponse<{ message: string }> = {
        ok: true,
        data: { message: 'Reset code sent' },
      };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);
