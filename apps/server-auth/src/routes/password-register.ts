import { Router, type Request, type Response, type NextFunction } from 'express';
import { createHash } from 'node:crypto';
import { hash } from 'argon2';
import { transaction } from '@ripcord/db';
import {
  ApiError,
  AuditAction,
  PasswordRegisterSchema,
  type ApiResponse,
  type PendingVerificationResponse,
} from '@ripcord/types';
import { rateLimit } from '../middleware/rate-limit.js';
import * as userRepo from '../repositories/user.repo.js';
import * as auditRepo from '../repositories/audit.repo.js';
import * as verificationService from '../services/verification.service.js';
import * as emailService from '../services/email.service.js';
import { redis } from '../redis.js';
import { logger } from '../logger.js';

export const passwordRegisterRouter: Router = Router();

// Rate limit: 5 registrations per minute per IP (tighter than passkey)
const registrationLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  keyPrefix: 'pw-register',
});

/** Pending registration data TTL in seconds (matches code TTL). */
const PENDING_REG_TTL_SEC = 15 * 60;

/**
 * POST /v1/auth/password/register
 *
 * Register a new account with a password and email.
 *
 * Creates the user in `pending_verification` status and sends a 6-digit
 * verification code to the provided email. No tokens are issued until
 * the email is verified via POST /v1/auth/verify-email.
 *
 * Request body: { handle, email, password, pubIdentityKey, deviceName? }
 * Response: { ok: true, data: PendingVerificationResponse }
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

      const { handle, email, password, pubIdentityKey, deviceName } = parsed.data;

      // Hash password with argon2id (OWASP defaults)
      const passwordHash = await hash(password);

      // SHA-256 hash of email for uniqueness constraint
      const emailHash = createHash('sha256').update(email.toLowerCase()).digest('hex');

      // Transaction: create user as pending_verification
      const user = await transaction(async (client) => {
        // Check handle uniqueness
        const existingHandle = await client.query(
          'SELECT id FROM users WHERE handle = $1 FOR UPDATE',
          [handle],
        );
        if (existingHandle.rows.length > 0) {
          throw ApiError.conflict('Handle is already taken');
        }

        // Check email uniqueness
        const existingEmail = await client.query(
          'SELECT id FROM users WHERE email_hash = $1',
          [emailHash],
        );
        if (existingEmail.rows.length > 0) {
          throw ApiError.conflict('Email is already registered');
        }

        return userRepo.createWithPasswordPending(
          client,
          handle,
          passwordHash,
          email.toLowerCase(),
          emailHash,
        );
      });

      // Store device info in Redis so verify-email can create the device later
      await redis.set(
        `pending-reg:${user.id}`,
        JSON.stringify({ pubIdentityKey, deviceName: deviceName ?? 'Default Device' }),
        'EX',
        PENDING_REG_TTL_SEC,
      );

      // Generate verification code and send email
      const code = await verificationService.createVerificationCode(user.id);
      await emailService.sendVerificationCode(email.toLowerCase(), code);

      // Audit: user registered (pending verification)
      await auditRepo.create(
        user.id,
        null,
        AuditAction.USER_REGISTER,
        'user',
        user.id,
        { handle, method: 'password', pendingVerification: true },
      );

      logger.info({ userId: user.id, handle }, 'New user registered (pending email verification)');

      const response: PendingVerificationResponse = {
        userId: user.id,
        handle: user.handle,
        maskedEmail: emailService.maskEmail(email),
      };

      const body: ApiResponse<PendingVerificationResponse> = { ok: true, data: response };
      res.status(201).json(body);
    } catch (err) {
      next(err);
    }
  },
);
