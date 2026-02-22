import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  ApiError,
  AuditAction,
  ClaimPrekeySchema,
  type ApiResponse,
  type KeyBundle,
  type PrekeyCount,
} from '@ripcord/types';
import { requireAuth } from '../middleware/require-auth.js';
import * as bundleRepo from '../repositories/bundle.repo.js';
import * as prekeyRepo from '../repositories/prekey.repo.js';
import * as auditRepo from '../repositories/audit.repo.js';
import { logger } from '../logger.js';

export const prekeysRouter: Router = Router();

// ---------------------------------------------------------------------------
// POST /v1/keys/prekeys/claim — Atomically claim a one-time prekey
// ---------------------------------------------------------------------------

/**
 * POST /v1/keys/prekeys/claim
 *
 * Atomically claim one unclaimed pre-key from a target user/device and
 * return the full key bundle. Used during X3DH initial key agreement.
 *
 * A user cannot claim their own pre-keys (self-messaging is not supported).
 *
 * Request body: {@link ClaimPrekeyInput}
 * Response: { ok: true, data: { bundle: KeyBundle, oneTimePrekey: string | null } }
 */
prekeysRouter.post(
  '/claim',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;

      // Validate body
      const parsed = ClaimPrekeySchema.safeParse(req.body);
      if (!parsed.success) {
        throw ApiError.badRequest(
          'Invalid prekey claim payload',
          parsed.error.flatten().fieldErrors,
        );
      }

      const { targetUserId, targetDeviceId } = parsed.data;

      // Cannot claim own prekey
      if (auth.sub === targetUserId) {
        throw ApiError.forbidden('Cannot claim your own pre-key');
      }

      // Atomically claim one unclaimed prekey
      const oneTimePrekey = await prekeyRepo.claimOne(targetUserId, targetDeviceId);

      // Fetch the full key bundle
      const bundle = await bundleRepo.findByUserAndDevice(targetUserId, targetDeviceId);
      if (!bundle) {
        throw ApiError.notFound('Key bundle not found for target device');
      }

      // Audit event
      await auditRepo.create(
        auth.sub,
        auth.did,
        AuditAction.PREKEY_CLAIMED,
        'device',
        targetDeviceId,
        {
          targetUserId,
          hasPrekeyRemaining: oneTimePrekey !== null,
        },
      );

      logger.info(
        {
          claimerId: auth.sub,
          targetUserId,
          targetDeviceId,
          hasPrekey: oneTimePrekey !== null,
        },
        'Pre-key claimed',
      );

      const body: ApiResponse<{ bundle: KeyBundle; oneTimePrekey: string | null }> = {
        ok: true,
        data: { bundle, oneTimePrekey },
      };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /v1/keys/prekeys/count — Get unclaimed prekey count
// ---------------------------------------------------------------------------

/**
 * GET /v1/keys/prekeys/count?deviceId=...
 *
 * Returns the number of unclaimed one-time pre-keys remaining for the
 * authenticated user's device. Clients use this to decide when to
 * replenish the pool.
 *
 * Query param: deviceId (UUIDv4)
 * Response: { ok: true, data: PrekeyCount }
 */
prekeysRouter.get(
  '/count',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const deviceId = req.query['deviceId'] as string | undefined;

      if (!deviceId) {
        throw ApiError.badRequest('deviceId query parameter is required');
      }

      const unclaimed = await prekeyRepo.countUnclaimed(auth.sub, deviceId);

      const body: ApiResponse<PrekeyCount> = {
        ok: true,
        data: { deviceId, unclaimed },
      };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);
