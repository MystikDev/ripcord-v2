import { Router, type Request, type Response, type NextFunction } from 'express';
import type { RegistrationResponseJSON } from '@simplewebauthn/types';
import { transaction } from '@ripcord/db';
import { ApiError, AuditAction, CreateUserSchema, type ApiResponse, type AuthResponse } from '@ripcord/types';
import { rateLimit } from '../middleware/rate-limit.js';
import * as userRepo from '../repositories/user.repo.js';
import * as credentialRepo from '../repositories/credential.repo.js';
import * as deviceRepo from '../repositories/device.repo.js';
import * as auditRepo from '../repositories/audit.repo.js';
import * as webauthnService from '../services/webauthn.service.js';
import * as sessionService from '../services/session.service.js';
import { logger } from '../logger.js';

export const registerRouter: Router = Router();

// Rate limit: 5 registrations per minute per IP
const registrationLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  keyPrefix: 'register',
});

/**
 * POST /v1/auth/register/begin
 *
 * Initiates the WebAuthn registration ceremony. Validates the requested
 * handle, checks for uniqueness, and returns WebAuthn credential creation
 * options for the client to pass to `navigator.credentials.create()`.
 *
 * Request body: { handle: string }
 * Response: { ok: true, data: PublicKeyCredentialCreationOptionsJSON }
 */
registerRouter.post(
  '/begin',
  registrationLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate handle format
      const parsed = CreateUserSchema.safeParse(req.body);
      if (!parsed.success) {
        throw ApiError.badRequest(
          'Invalid handle',
          parsed.error.flatten().fieldErrors,
        );
      }

      const { handle } = parsed.data;

      // Check uniqueness
      const existing = await userRepo.findByHandle(handle);
      if (existing) {
        throw ApiError.conflict('Handle is already taken');
      }

      // Generate WebAuthn registration options (no existing credentials for new user)
      const options = await webauthnService.genRegistrationOptions(handle, []);

      const body: ApiResponse = { ok: true, data: options };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

/** Shape of the /register/finish request body. */
interface RegisterFinishBody {
  handle: string;
  credential: RegistrationResponseJSON;
  deviceName?: string;
  pubIdentityKey: string;
}

/**
 * POST /v1/auth/register/finish
 *
 * Completes the WebAuthn registration ceremony. Verifies the attestation
 * response, then in a single database transaction creates:
 * - The user account
 * - The initial device record
 * - The WebAuthn credential
 * - The first authenticated session
 *
 * Finally creates an audit event and returns the auth response with tokens.
 *
 * Request body: { handle, credential (RegistrationResponseJSON), deviceName?, pubIdentityKey }
 * Response: { ok: true, data: AuthResponse }
 */
registerRouter.post(
  '/finish',
  registrationLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { handle, credential, deviceName, pubIdentityKey } = req.body as RegisterFinishBody;

      if (!handle || !credential || !pubIdentityKey) {
        throw ApiError.badRequest('Missing required fields: handle, credential, pubIdentityKey');
      }

      // Validate handle format
      const parsed = CreateUserSchema.safeParse({ handle });
      if (!parsed.success) {
        throw ApiError.badRequest(
          'Invalid handle',
          parsed.error.flatten().fieldErrors,
        );
      }

      // Verify the attestation
      const verification = await webauthnService.verifyRegistration(handle, credential);
      const { registrationInfo } = verification;

      if (!registrationInfo) {
        throw ApiError.badRequest('Registration verification returned no credential info');
      }

      const { credential: webauthnCred } = registrationInfo;

      // Single transaction: create user -> device -> credential
      const { user, device } = await transaction(async (client) => {
        // Double-check uniqueness inside transaction
        const existingUser = await client.query(
          'SELECT id FROM users WHERE handle = $1 FOR UPDATE',
          [handle],
        );
        if (existingUser.rows.length > 0) {
          throw ApiError.conflict('Handle is already taken');
        }

        const newUser = await userRepo.create(client, handle);
        const newDevice = await deviceRepo.create(
          client,
          newUser.id,
          deviceName ?? 'Default Device',
          pubIdentityKey,
        );

        return { user: newUser, device: newDevice };
      });

      // Store the WebAuthn credential (outside transaction — user exists now)
      await credentialRepo.create(
        user.id,
        webauthnCred.id,
        Buffer.from(webauthnCred.publicKey),
        webauthnCred.counter,
        webauthnCred.transports as string[] | undefined,
        deviceName,
      );

      // Create the initial session
      const result = await sessionService.createSession(user.id, device.id);

      // Audit: user registered
      await auditRepo.create(
        user.id,
        device.id,
        AuditAction.USER_REGISTER,
        'user',
        user.id,
        { handle },
      );

      logger.info({ userId: user.id, handle }, 'New user registered');

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
