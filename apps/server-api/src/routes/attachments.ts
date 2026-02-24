import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import express, { Router, type Request, type Response, type NextFunction } from 'express';
import { ApiError, Permission } from '@ripcord/types';
import type { ApiResponse, PresignedUploadResponse, PresignedDownloadResponse } from '@ripcord/types';
import { env } from '@ripcord/config';
import { requireAuth } from '../middleware/require-auth.js';
import { validate } from '../middleware/validate.js';
import * as attachmentRepo from '../repositories/attachment.repo.js';
import * as channelRepo from '../repositories/channel.repo.js';
import * as memberRepo from '../repositories/member.repo.js';
import * as permissionService from '../services/permission.service.js';
import * as storage from '../services/storage.service.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { z } from 'zod';

export const attachmentsRouter: Router = Router({ mergeParams: true });

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const BLOB_TOKEN_EXPIRES_MS = 3600_000; // 1 hour

// ---------------------------------------------------------------------------
// Signed blob tokens (replaces presigned S3 URLs)
//
// The client never talks to MinIO directly. Instead the API server proxies
// uploads and downloads, authenticating via a short-lived HMAC token embedded
// in the URL — exactly like an S3 presigned URL, but routed through :4000.
// ---------------------------------------------------------------------------

function createBlobToken(attachmentId: string, action: 'upload' | 'download'): string {
  const expiresAt = Date.now() + BLOB_TOKEN_EXPIRES_MS;
  const payload = `${attachmentId}:${action}:${expiresAt}`;
  const sig = createHmac('sha256', env.JWT_SECRET).update(payload).digest('base64url');
  return `${Buffer.from(payload).toString('base64url')}.${sig}`;
}

function verifyBlobToken(token: string, attachmentId: string, action: 'upload' | 'download'): boolean {
  try {
    const dotIdx = token.indexOf('.');
    if (dotIdx < 0) return false;
    const payloadB64 = token.slice(0, dotIdx);
    const sig = token.slice(dotIdx + 1);
    if (!payloadB64 || !sig) return false;

    const payload = Buffer.from(payloadB64, 'base64url').toString();
    const parts = payload.split(':');
    if (parts.length !== 3) return false;

    const [aid, act, exp] = parts;
    if (aid !== attachmentId || act !== action) return false;
    if (Date.now() > Number(exp)) return false;

    const expectedSig = createHmac('sha256', env.JWT_SECRET).update(payload).digest('base64url');
    if (sig.length !== expectedSig.length) return false;
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Schemas & rate limiting
// ---------------------------------------------------------------------------

const UploadAttachmentSchema = z.object({
  // messageId is ignored — attachments are created as pending (null message_id)
  // and linked to a real message when the user sends it.
  messageId: z.string().optional(),
  fileNameEncrypted: z.string().min(1).max(1024),
  fileSize: z.number().int().min(1).max(MAX_FILE_SIZE),
  contentTypeEncrypted: z.string().max(512).optional(),
  encryptionKeyId: z.string().min(1).max(256),
  nonce: z.string().min(1).max(128),
});

const attachmentRateLimit = rateLimit({
  windowMs: 60_000,
  max: 20,
  keyPrefix: 'rl:attach',
  keyExtractor: (req) => req.auth?.sub ?? 'anon',
});

// ---------------------------------------------------------------------------
// POST /v1/channels/:channelId/attachments/upload
//
// Creates a pending attachment and returns a proxied upload URL (no S3 exposed).
// ---------------------------------------------------------------------------

attachmentsRouter.post(
  '/channels/:channelId/attachments/upload',
  requireAuth,
  attachmentRateLimit,
  validate(UploadAttachmentSchema),
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
        fileNameEncrypted, fileSize,
        contentTypeEncrypted, encryptionKeyId, nonce,
      } = req.body as z.infer<typeof UploadAttachmentSchema>;

      const storageKey = `${channelId}/${randomUUID()}`;

      const attachment = await attachmentRepo.create({
        messageId: null, // Pending — linked to real message on send
        channelId,
        uploaderUserId: auth.sub,
        fileNameEncrypted,
        fileSize,
        contentTypeEncrypted: contentTypeEncrypted ?? null,
        storageKey,
        encryptionKeyId,
        nonce,
      });

      // Return a proxied upload URL — client PUTs encrypted bytes here.
      const token = createBlobToken(attachment.id, 'upload');
      const uploadUrl = `/v1/attachments/${attachment.id}/blob?token=${token}`;

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

// ---------------------------------------------------------------------------
// PUT /v1/attachments/:attachmentId/blob?token=...
//
// Receives encrypted file bytes from the client and stores them in MinIO.
// Authenticated via signed blob token (no Bearer header required).
// ---------------------------------------------------------------------------

attachmentsRouter.put(
  '/attachments/:attachmentId/blob',
  express.raw({ type: 'application/octet-stream', limit: '25mb' }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const attachmentId = req.params['attachmentId'] as string;
      const token = req.query['token'] as string | undefined;
      if (!token || !verifyBlobToken(token, attachmentId, 'upload')) {
        throw ApiError.forbidden('Invalid or expired upload token');
      }

      const attachment = await attachmentRepo.findById(attachmentId);
      if (!attachment) throw ApiError.notFound('Attachment not found');

      const body = req.body as Buffer;
      if (!body || body.length === 0) throw ApiError.badRequest('Empty file body');
      if (body.length > MAX_FILE_SIZE) throw ApiError.badRequest('File too large');

      await storage.uploadDirect(attachment.storageKey, body, 'application/octet-stream');

      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /v1/attachments/:attachmentId/download
//
// Returns a proxied download URL (token-signed, no S3 exposed).
// ---------------------------------------------------------------------------

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

      // Return a proxied download URL instead of a presigned S3 URL
      const token = createBlobToken(attachmentId, 'download');
      const downloadUrl = `/v1/attachments/${attachmentId}/blob?token=${token}`;

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

// ---------------------------------------------------------------------------
// GET /v1/attachments/:attachmentId/blob?token=...
//
// Streams encrypted file bytes from MinIO to the client.
// Authenticated via signed blob token (no Bearer header required).
// ---------------------------------------------------------------------------

attachmentsRouter.get(
  '/attachments/:attachmentId/blob',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const attachmentId = req.params['attachmentId'] as string;
      const token = req.query['token'] as string | undefined;
      if (!token || !verifyBlobToken(token, attachmentId, 'download')) {
        throw ApiError.forbidden('Invalid or expired download token');
      }

      const attachment = await attachmentRepo.findById(attachmentId);
      if (!attachment) throw ApiError.notFound('Attachment not found');

      const obj = await storage.getObject(attachment.storageKey);

      res.setHeader('Content-Type', obj.contentType ?? 'application/octet-stream');
      if (obj.contentLength) res.setHeader('Content-Length', obj.contentLength);

      obj.body.pipe(res);
    } catch (err) {
      next(err);
    }
  },
);
