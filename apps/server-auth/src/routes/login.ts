import { Router, type Request, type Response, type NextFunction } from 'express';
import type { AuthenticationResponseJSON } from '@simplewebauthn/types';
import { ApiError, AuditAction, type ApiResponse, type AuthResponse } from '@ripcord/types';
import { rateLimit } from '../middleware/rate-limit.js';
import * as userRepo from '../repositories/user.repo.js';
import * as credentialRepo from '../repositories/credential.repo.js';
import * as deviceRepo from '../repositories/device.repo.js';
import * as auditRepo from '../repositories/audit.repo.js';
import * as webauthnService from '../services/webauthn.service.js';
import * as sessionService from '../services/session.service.js';
import { logger } from '../logger.js';

export const loginRouter: Router = Router();

// Rate limit: 10 login attempts per minute per IP
const loginLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  keyPrefix: 'login',
});

/**
 * POST /v1/auth/login/begin
 *
 * Initiates the WebAuthn authentication ceremony. Looks up the user by
 * handle, retrieves their registered credentials, and returns WebAuthn
 * authentication options for the client.
 *
 * Request body: { handle: string }
 * Response: { ok: true, data: PublicKeyCredentialRequestOptionsJSON }
 */
loginRouter.post(
  '/begin',
  loginLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { handle } = req.body as { handle?: string };
      if (!handle) {
        throw ApiError.badRequest('Handle is required');
      }

      const user = await userRepo.findByHandle(handle);
      if (!user) {
        // Return generic error to avoid user enumeration
        throw ApiError.unauthorized('Invalid credentials');
      }

      const credentials = await credentialRepo.findByUserId(user.id);
      if (credentials.length === 0) {
        throw ApiError.unauthorized('No credentials registered for this account');
      }

      const options = await webauthnService.genAuthenticationOptions(user.id, credentials);

      const body: ApiResponse = { ok: true, data: options };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

/** Shape of the /login/finish request body. */
interface LoginFinishBody {
  handle: string;
  credential: AuthenticationResponseJSON;
  deviceName?: string;
  pubIdentityKey: string;
}

/**
 * POST /v1/auth/login/finish
 *
 * Completes the WebAuthn authentication ceremony. Verifies the assertion
 * against the stored credential, updates the signature counter, creates
 * or looks up the device, creates a new session, and returns the auth
 * response with tokens.
 *
 * Request body: { handle, credential (AuthenticationResponseJSON), deviceName?, pubIdentityKey }
 * Response: { ok: true, data: AuthResponse }
 */
loginRouter.post(
  '/finish',
  loginLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { handle, credential, deviceName, pubIdentityKey } = req.body as LoginFinishBody;

      if (!handle || !credential || !pubIdentityKey) {
        throw ApiError.badRequest('Missing required fields: handle, credential, pubIdentityKey');
      }

      // Look up the user
      const user = await userRepo.findByHandle(handle);
      if (!user) {
        throw ApiError.unauthorized('Invalid credentials');
      }

      // Find the credential being used for authentication
      const storedCredential = await credentialRepo.findByCredentialId(credential.id);
      if (!storedCredential || storedCredential.user_id !== user.id) {
        throw ApiError.unauthorized('Invalid credentials');
      }

      // Verify the assertion
      const verification = await webauthnService.verifyAuthentication(
        user.id,
        credential,
        storedCredential,
      );

      // Update the signature counter to detect cloned authenticators
      await credentialRepo.updateCounter(
        storedCredential.credential_id,
        verification.authenticationInfo.newCounter,
      );

      // Find or create the device
      let device = await deviceRepo.findByUserIdAndKey(user.id, pubIdentityKey);
      if (!device) {
        // New device — create it via direct query (outside transaction is acceptable here)
        const { transaction } = await import('@ripcord/db');
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

      // Audit: user logged in
      await auditRepo.create(
        user.id,
        device.id,
        AuditAction.USER_LOGIN,
        'user',
        user.id,
        { handle },
      );

      logger.info({ userId: user.id, handle }, 'User logged in');

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
