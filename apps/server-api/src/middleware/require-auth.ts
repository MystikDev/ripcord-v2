import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, type RipcordJwtPayload } from '@ripcord/crypto';
import { ApiError } from '@ripcord/types';

/**
 * Augment the Express Request type with an `auth` property
 * that is populated after JWT verification.
 */
declare global {
  namespace Express {
    interface Request {
      /** Populated by the requireAuth middleware after JWT verification. */
      auth?: RipcordJwtPayload;
    }
  }
}

/**
 * Authentication middleware that verifies the JWT from the Authorization header.
 *
 * Expects the header in the format `Bearer <token>`. On success, populates
 * `req.auth` with the decoded {@link RipcordJwtPayload} containing `sub`
 * (userId), `did` (deviceId), and `sid` (sessionId).
 *
 * @throws {ApiError} 401 if the header is missing, malformed, or the token is invalid.
 */
export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    next(ApiError.unauthorized('Missing or malformed Authorization header'));
    return;
  }

  const token = header.slice(7);

  try {
    const payload = await verifyAccessToken(token);
    req.auth = payload;
    next();
  } catch {
    next(ApiError.unauthorized('Invalid or expired access token'));
  }
}
