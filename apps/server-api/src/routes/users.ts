import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { ApiError, type ApiResponse } from '@ripcord/types';
import { requireAuth } from '../middleware/require-auth.js';
import { rateLimit } from '../middleware/rate-limit.js';
import * as userRepo from '../repositories/user.repo.js';
import * as storage from '../services/storage.service.js';
import { logger } from '../logger.js';

export const usersRouter: Router = Router();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Allowed MIME types for user avatars. */
const ALLOWED_AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif']);

/** Map MIME type to file extension. */
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
};

/** Maximum avatar file size: 512 KB. */
const MAX_AVATAR_SIZE = 512 * 1024;

const avatarRateLimit = rateLimit({
  windowMs: 60_000,
  max: 10,
  keyPrefix: 'rl:user-avatar',
  keyExtractor: (req) => req.auth?.sub ?? 'anon',
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the raw request body as a Buffer.
 *
 * Expects `express.raw()` to have already parsed the body into a Buffer.
 * Throws if the body is missing or exceeds the limit.
 */
function collectRawBody(req: Request, limit: number): Buffer {
  if (Buffer.isBuffer(req.body)) {
    if (req.body.length > limit) {
      throw ApiError.badRequest(`Request body exceeds ${limit} bytes`);
    }
    return req.body;
  }
  throw ApiError.badRequest('No image data received');
}

// ---------------------------------------------------------------------------
// POST /v1/users/:id/avatar
// ---------------------------------------------------------------------------

/**
 * Upload a user avatar image directly (server-proxied to MinIO).
 * Users can only upload their own avatar (auth.sub must match :id).
 *
 * Body: raw binary image data with Content-Type header set to the image MIME type.
 * Response: { ok: true, data: { avatarUrl: string } }
 */
usersRouter.post(
  '/:id/avatar',
  requireAuth,
  avatarRateLimit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const userId = req.params['id'] as string | undefined;
      if (!userId) throw ApiError.badRequest('User ID is required');

      // Users can only upload their own avatar
      if (auth.sub !== userId) {
        throw ApiError.forbidden('You can only upload your own avatar');
      }

      const contentType = req.headers['content-type'] ?? '';
      if (!ALLOWED_AVATAR_TYPES.has(contentType)) {
        throw ApiError.badRequest('Avatar must be JPEG, PNG, or GIF');
      }

      const imageBuffer = collectRawBody(req, MAX_AVATAR_SIZE);

      logger.info(
        { userId, contentType, bodyBytes: imageBuffer.length },
        'User avatar upload: body received',
      );

      if (imageBuffer.length === 0) {
        throw ApiError.badRequest('No image data received');
      }

      const ext = MIME_TO_EXT[contentType] ?? 'png';
      const storageKey = `user-avatars/${userId}/${randomUUID()}.${ext}`;

      // Upload directly to MinIO (server-side, no CORS issues)
      await storage.uploadDirect(storageKey, imageBuffer, contentType);

      // Persist storage key to DB
      await userRepo.updateAvatarUrl(userId, storageKey);

      logger.info({ userId, storageKey }, 'User avatar uploaded');

      const body: ApiResponse<{ avatarUrl: string }> = {
        ok: true,
        data: { avatarUrl: storageKey },
      };
      res.status(200).json(body);
    } catch (err) {
      logger.error({ err, userId: req.params['id'] }, 'User avatar upload failed');
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /v1/users/:id/avatar
// ---------------------------------------------------------------------------

/**
 * Serve the user's avatar image by proxying it from MinIO.
 * No auth required — user avatars are public, like Discord profile pictures.
 *
 * Returns 200 with the image body, or 404 if no avatar is set.
 */
usersRouter.get(
  '/:id/avatar',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.params['id'] as string | undefined;
      if (!userId) throw ApiError.badRequest('User ID is required');

      const user = await userRepo.findById(userId);
      if (!user) throw ApiError.notFound('User not found');
      if (!user.avatarUrl) throw ApiError.notFound('User has no avatar');

      const object = await storage.getObject(user.avatarUrl);
      res.setHeader('Content-Type', object.contentType ?? 'image/jpeg');
      if (object.contentLength) res.setHeader('Content-Length', String(object.contentLength));
      // Override helmet defaults: allow cross-origin loading and enable caching
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      object.body.pipe(res);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// DELETE /v1/users/:id/avatar
// ---------------------------------------------------------------------------

/**
 * Remove the user's avatar. Users can only remove their own avatar.
 *
 * Response: { ok: true, data: { message: "Avatar removed" } }
 */
usersRouter.delete(
  '/:id/avatar',
  requireAuth,
  avatarRateLimit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const userId = req.params['id'] as string | undefined;
      if (!userId) throw ApiError.badRequest('User ID is required');

      // Users can only remove their own avatar
      if (auth.sub !== userId) {
        throw ApiError.forbidden('You can only remove your own avatar');
      }

      await userRepo.updateAvatarUrl(userId, null);

      logger.info({ userId }, 'User avatar removed');

      const body: ApiResponse = { ok: true, data: { message: 'Avatar removed' } };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);
