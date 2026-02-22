import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { ApiError, Permission } from '@ripcord/types';
import type { ApiResponse, PresignedUploadResponse, PresignedDownloadResponse } from '@ripcord/types';
import { requireAuth } from '../middleware/require-auth.js';
import * as attachmentRepo from '../repositories/attachment.repo.js';
import * as channelRepo from '../repositories/channel.repo.js';
import * as memberRepo from '../repositories/member.repo.js';
import * as permissionService from '../services/permission.service.js';
import * as storage from '../services/storage.service.js';
import { rateLimit } from '../middleware/rate-limit.js';

export const attachmentsRouter: Router = Router({ mergeParams: true });

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

const attachmentRateLimit = rateLimit({
  windowMs: 60_000,
  max: 20,
  keyPrefix: 'rl:attach',
  keyExtractor: (req) => req.auth?.sub ?? 'anon',
});

/**
 * POST /v1/channels/:channelId/attachments/upload
 *
 * Request a pre-signed upload URL for an encrypted file.
 * Creates a pending attachment record and returns the URL.
 *
 * Body: { messageId, fileNameEncrypted, fileSize, contentTypeEncrypted, encryptionKeyId, nonce }
 */
attachmentsRouter.post(
  '/channels/:channelId/attachments/upload',
  requireAuth,
  attachmentRateLimit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const channelId = req.params['channelId'] as string | undefined;
      if (!channelId) throw ApiError.badRequest('channelId is required');

      // Verify channel + membership
      const channel = await channelRepo.findById(channelId);
      if (!channel) throw ApiError.notFound('Channel not found');

      const membership = await memberRepo.findOne(channel.hubId, auth.sub);
      if (!membership) throw ApiError.forbidden('Not a member of this hub');

      // Check ATTACH_FILES permission
      const hasAttachPerm = await permissionService.checkPermission(
        channel.hubId, channelId, auth.sub, Permission.ATTACH_FILES,
      );
      if (!hasAttachPerm) throw ApiError.forbidden('Missing ATTACH_FILES permission');

      const {
        messageId, fileNameEncrypted, fileSize,
        contentTypeEncrypted, encryptionKeyId, nonce,
      } = req.body as {
        messageId: string;
        fileNameEncrypted: string;
        fileSize: number;
        contentTypeEncrypted?: string;
        encryptionKeyId: string;
        nonce: string;
      };

      if (!messageId || !fileNameEncrypted || !fileSize || !encryptionKeyId || !nonce) {
        throw ApiError.badRequest('Missing required fields');
      }

      if (fileSize > MAX_FILE_SIZE) {
        throw ApiError.badRequest(`File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024} MB`);
      }

      const storageKey = `${channelId}/${randomUUID()}`;

      const attachment = await attachmentRepo.create({
        messageId,
        channelId,
        uploaderUserId: auth.sub,
        fileNameEncrypted,
        fileSize,
        contentTypeEncrypted: contentTypeEncrypted ?? null,
        storageKey,
        encryptionKeyId,
        nonce,
      });

      const uploadUrl = await storage.getUploadUrl(storageKey, fileSize);

      const body: ApiResponse<PresignedUploadResponse> = {
        ok: true,
        data: { attachmentId: attachment.id, uploadUrl, storageKey },
      };
      res.status(201).json(body);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /v1/attachments/:attachmentId/download
 *
 * Get a pre-signed download URL for an attachment.
 */
attachmentsRouter.get(
  '/attachments/:attachmentId/download',
  requireAuth,
  attachmentRateLimit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const attachmentId = req.params['attachmentId'] as string | undefined;
      if (!attachmentId) throw ApiError.badRequest('attachmentId is required');

      const attachment = await attachmentRepo.findById(attachmentId);
      if (!attachment) throw ApiError.notFound('Attachment not found');

      // Verify channel access
      const channel = await channelRepo.findById(attachment.channelId);
      if (!channel) throw ApiError.notFound('Channel not found');

      const membership = await memberRepo.findOne(channel.hubId, auth.sub);
      if (!membership) throw ApiError.forbidden('Not a member of this hub');

      // Check VIEW_CHANNELS permission
      const canView = await permissionService.checkPermission(
        channel.hubId, attachment.channelId, auth.sub, Permission.VIEW_CHANNELS,
      );
      if (!canView) throw ApiError.forbidden('Missing VIEW_CHANNELS permission');

      const downloadUrl = await storage.getDownloadUrl(attachment.storageKey);

      const body: ApiResponse<PresignedDownloadResponse> = {
        ok: true,
        data: { downloadUrl, attachment },
      };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);
