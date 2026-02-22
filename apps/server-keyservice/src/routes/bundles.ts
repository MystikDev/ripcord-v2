import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { transaction } from '@ripcord/db';
import {
  ApiError,
  AuditAction,
  UploadBundleSchema,
  type ApiResponse,
  type KeyBundle,
} from '@ripcord/types';
import { requireAuth } from '../middleware/require-auth.js';
import * as bundleRepo from '../repositories/bundle.repo.js';
import * as prekeyRepo from '../repositories/prekey.repo.js';
import * as auditRepo from '../repositories/audit.repo.js';
import { logger } from '../logger.js';

export const bundlesRouter: Router = Router();

// ---------------------------------------------------------------------------
// Zod schema for key rotation (local to this service)
// ---------------------------------------------------------------------------

const RotateBundleSchema = z.object({
  deviceId: z.string().uuid(),
  signedPrekeyPub: z.string().min(1),
  signedPrekeySig: z.string().min(1),
  oneTimePrekeys: z.array(z.string().min(1)).max(100).optional(),
});

// ---------------------------------------------------------------------------
// POST /v1/keys/bundles — Upload key bundle + one-time prekeys
// ---------------------------------------------------------------------------

/**
 * POST /v1/keys/bundles
 *
 * Upload a new key bundle along with a batch of one-time pre-keys.
 * The bundle is upserted (replaced if one already exists for the device).
 * Only the authenticated device owner may upload.
 *
 * Request body: {@link UploadBundleInput}
 * Response: { ok: true, data: { bundleUploaded: true, prekeysAdded: number } }
 */
bundlesRouter.post(
  '/',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;

      // Validate body
      const parsed = UploadBundleSchema.safeParse(req.body);
      if (!parsed.success) {
        throw ApiError.badRequest(
          'Invalid bundle upload payload',
          parsed.error.flatten().fieldErrors,
        );
      }

      const { deviceId, identityPub, signedPrekeyPub, signedPrekeySig, oneTimePrekeys } =
        parsed.data;

      // Verify the authenticated device matches the upload target
      if (auth.did !== deviceId) {
        throw ApiError.forbidden('Cannot upload keys for a device you do not own');
      }

      // Transaction: upsert bundle + insert prekeys
      const prekeysAdded = await transaction(async (client) => {
        await bundleRepo.upsert(
          client,
          auth.sub,
          deviceId,
          identityPub,
          signedPrekeyPub,
          signedPrekeySig,
        );

        return prekeyRepo.insertBatch(client, auth.sub, deviceId, oneTimePrekeys);
      });

      // Audit event
      await auditRepo.create(
        auth.sub,
        auth.did,
        AuditAction.KEY_BUNDLE_UPLOADED,
        'device',
        deviceId,
        { prekeysAdded },
      );

      logger.info(
        { userId: auth.sub, deviceId, prekeysAdded },
        'Key bundle uploaded',
      );

      const body: ApiResponse<{ bundleUploaded: boolean; prekeysAdded: number }> = {
        ok: true,
        data: { bundleUploaded: true, prekeysAdded },
      };
      res.status(201).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /v1/keys/bundles/:userId/:deviceId — Fetch a key bundle
// ---------------------------------------------------------------------------

/**
 * GET /v1/keys/bundles/:userId/:deviceId
 *
 * Fetch the key bundle for a specific user/device pair. Any authenticated
 * user may fetch any bundle (needed for X3DH key agreement).
 *
 * Response: { ok: true, data: KeyBundle }
 */
bundlesRouter.get(
  '/:userId/:deviceId',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.params['userId'] as string | undefined;
      const deviceId = req.params['deviceId'] as string | undefined;

      if (!userId || !deviceId) {
        throw ApiError.badRequest('userId and deviceId are required');
      }

      const bundle = await bundleRepo.findByUserAndDevice(userId, deviceId);
      if (!bundle) {
        throw ApiError.notFound('Key bundle not found');
      }

      const body: ApiResponse<KeyBundle> = { ok: true, data: bundle };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// PUT /v1/keys/bundles — Key rotation
// ---------------------------------------------------------------------------

/**
 * PUT /v1/keys/bundles
 *
 * Rotate the signed pre-key and optionally refill one-time pre-keys.
 * Only the authenticated device owner may rotate keys.
 *
 * Request body: { deviceId, signedPrekeyPub, signedPrekeySig, oneTimePrekeys? }
 * Response: { ok: true, data: { rotated: true, prekeysAdded: number } }
 */
bundlesRouter.put(
  '/',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;

      // Validate body
      const parsed = RotateBundleSchema.safeParse(req.body);
      if (!parsed.success) {
        throw ApiError.badRequest(
          'Invalid key rotation payload',
          parsed.error.flatten().fieldErrors,
        );
      }

      const { deviceId, signedPrekeyPub, signedPrekeySig, oneTimePrekeys } = parsed.data;

      // Verify the authenticated device matches
      if (auth.did !== deviceId) {
        throw ApiError.forbidden('Cannot rotate keys for a device you do not own');
      }

      // Transaction: rotate signed prekey + insert new prekeys
      const { bundle, prekeysAdded } = await transaction(async (client) => {
        const rotated = await bundleRepo.rotateSignedPrekey(
          client,
          auth.sub,
          deviceId,
          signedPrekeyPub,
          signedPrekeySig,
        );

        if (!rotated) {
          throw ApiError.notFound('No existing key bundle found for this device');
        }

        const added = oneTimePrekeys
          ? await prekeyRepo.insertBatch(client, auth.sub, deviceId, oneTimePrekeys)
          : 0;

        return { bundle: rotated, prekeysAdded: added };
      });

      // Audit event
      await auditRepo.create(
        auth.sub,
        auth.did,
        AuditAction.KEY_ROTATION,
        'device',
        deviceId,
        { prekeysAdded },
      );

      logger.info(
        { userId: auth.sub, deviceId, prekeysAdded },
        'Key bundle rotated',
      );

      const body: ApiResponse<{ rotated: boolean; prekeysAdded: number }> = {
        ok: true,
        data: { rotated: true, prekeysAdded },
      };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);
