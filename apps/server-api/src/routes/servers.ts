import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  ApiError,
  type ApiResponse,
  type Hub,
  type Role,
  CreateHubSchema,
  ChannelType,
  Permission,
  AuditAction,
} from '@ripcord/types';
import { requireAuth } from '../middleware/require-auth.js';
import { validate } from '../middleware/validate.js';
import { rateLimit } from '../middleware/rate-limit.js';
import * as hubRepo from '../repositories/server.repo.js';
import * as channelRepo from '../repositories/channel.repo.js';
import * as memberRepo from '../repositories/member.repo.js';
import * as roleRepo from '../repositories/role.repo.js';
import * as banRepo from '../repositories/ban.repo.js';
import * as auditRepo from '../repositories/audit.repo.js';
import * as permissionService from '../services/permission.service.js';
import * as storage from '../services/storage.service.js';
import { logger } from '../logger.js';

export const hubsRouter: Router = Router();

/**
 * Default permissions for the @everyone role.
 * VIEW_CHANNELS | SEND_MESSAGES | CONNECT_VOICE | SPEAK_VOICE
 */
const DEFAULT_EVERYONE_PERMISSIONS =
  Permission.VIEW_CHANNELS |
  Permission.SEND_MESSAGES |
  Permission.CONNECT_VOICE |
  Permission.SPEAK_VOICE;

/**
 * GET /v1/hubs
 *
 * List all hubs the authenticated user is a member of.
 *
 * Response: { ok: true, data: Hub[] }
 */
hubsRouter.get(
  '/',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const hubs = await hubRepo.findByUserId(auth.sub);
      const body: ApiResponse<Hub[]> = { ok: true, data: hubs };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /v1/hubs
 *
 * Create a new hub. Automatically:
 * - Creates a #general text channel
 * - Creates a #voice voice channel
 * - Adds the creator as a member
 * - Creates an @everyone role with default permissions
 *
 * Body: { name: string }
 * Response: { ok: true, data: Hub }
 */
hubsRouter.post(
  '/',
  requireAuth,
  validate(CreateHubSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const { name } = req.body as { name: string };

      // Create hub, default channels, member, and @everyone role
      const hub = await hubRepo.create(name, auth.sub);

      // Create default channels
      await channelRepo.create(hub.id, 'general', ChannelType.TEXT);
      await channelRepo.create(hub.id, 'voice', ChannelType.VOICE);

      // Add owner as member
      await memberRepo.add(hub.id, auth.sub);

      // Create @everyone role with default permissions
      await roleRepo.create(
        hub.id,
        '@everyone',
        0,
        String(DEFAULT_EVERYONE_PERMISSIONS),
      );

      // Audit event
      auditRepo.create(
        auth.sub,
        auth.did,
        AuditAction.HUB_CREATED,
        'hub',
        hub.id,
        { name },
        hub.id,
      ).catch((err: unknown) => {
        logger.error({ err }, 'Failed to create hub audit event');
      });

      logger.info({ hubId: hub.id, userId: auth.sub }, 'Hub created');

      const body: ApiResponse<Hub> = { ok: true, data: hub };
      res.status(201).json(body);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /v1/hubs/:id
 *
 * Get hub details. Requires the caller to be a member.
 *
 * Response: { ok: true, data: Hub }
 */
hubsRouter.get(
  '/:id',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const hubId = req.params['id'] as string | undefined;

      if (!hubId) {
        throw ApiError.badRequest('Hub ID is required');
      }

      // Verify membership
      const membership = await memberRepo.findOne(hubId, auth.sub);
      if (!membership) {
        throw ApiError.forbidden('You are not a member of this hub');
      }

      const hub = await hubRepo.findById(hubId);
      if (!hub) {
        throw ApiError.notFound('Hub not found');
      }

      const body: ApiResponse<Hub> = { ok: true, data: hub };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /v1/hubs/:id/roles
 *
 * List all roles for a hub. Requires the caller to be a member.
 *
 * Response: { ok: true, data: Role[] }
 */
hubsRouter.get(
  '/:id/roles',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const hubId = req.params['id'] as string | undefined;

      if (!hubId) {
        throw ApiError.badRequest('Hub ID is required');
      }

      // Verify membership
      const membership = await memberRepo.findOne(hubId, auth.sub);
      if (!membership) {
        throw ApiError.forbidden('You are not a member of this hub');
      }

      const roles = await roleRepo.findByHubId(hubId);
      const body: ApiResponse<Role[]> = { ok: true, data: roles };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /v1/hubs/:id
 *
 * Update hub settings. Requires MANAGE_HUB permission.
 *
 * Body: { name: string }
 * Response: { ok: true, data: Hub }
 */
hubsRouter.patch(
  '/:id',
  requireAuth,
  validate(CreateHubSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const hubId = req.params['id'] as string | undefined;
      const { name } = req.body as { name: string };

      if (!hubId) {
        throw ApiError.badRequest('Hub ID is required');
      }

      // Verify membership
      const membership = await memberRepo.findOne(hubId, auth.sub);
      if (!membership) {
        throw ApiError.forbidden('You are not a member of this hub');
      }

      // Check MANAGE_HUB permission
      // Use a channel lookup to get any channel in the hub for permission check
      const channels = await channelRepo.findByHubId(hubId);
      const firstChannel = channels[0];
      if (!firstChannel) {
        throw ApiError.internal('Hub has no channels');
      }

      const hasPerm = await permissionService.checkPermission(
        hubId,
        firstChannel.id,
        auth.sub,
        Permission.MANAGE_HUB,
      );
      if (!hasPerm) {
        throw ApiError.forbidden('Missing MANAGE_HUB permission');
      }

      const hub = await hubRepo.updateName(hubId, name);
      if (!hub) {
        throw ApiError.notFound('Hub not found');
      }

      const body: ApiResponse<Hub> = { ok: true, data: hub };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /v1/hubs/:id
 *
 * Delete a hub. Only the hub owner can delete it.
 * All channels, members, roles, bans cascade via FK.
 *
 * Response: { ok: true, data: { message: "Hub deleted" } }
 */
hubsRouter.delete(
  '/:id',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const hubId = req.params['id'] as string | undefined;

      if (!hubId) {
        throw ApiError.badRequest('Hub ID is required');
      }

      const hub = await hubRepo.findById(hubId);
      if (!hub) {
        throw ApiError.notFound('Hub not found');
      }

      // Only the owner can delete the hub
      if (hub.ownerUserId !== auth.sub) {
        throw ApiError.forbidden('Only the hub owner can delete the hub');
      }

      await hubRepo.deleteHub(hubId);

      // Audit event (hub is gone, so no hubId in last param)
      auditRepo.create(
        auth.sub,
        auth.did,
        AuditAction.HUB_DELETED,
        'hub',
        hubId,
        { name: hub.name },
      ).catch((err: unknown) => {
        logger.error({ err }, 'Failed to create hub-deleted audit event');
      });

      logger.info({ hubId, actorId: auth.sub }, 'Hub deleted');

      const body: ApiResponse = { ok: true, data: { message: 'Hub deleted' } };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /v1/hubs/:id/join
 *
 * Join a hub. Adds the caller as a member.
 *
 * Response: { ok: true, data: { message: "Joined hub" } }
 */
hubsRouter.post(
  '/:id/join',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const hubId = req.params['id'] as string | undefined;

      if (!hubId) {
        throw ApiError.badRequest('Hub ID is required');
      }

      // Verify hub exists
      const hub = await hubRepo.findById(hubId);
      if (!hub) {
        throw ApiError.notFound('Hub not found');
      }

      // Check if user is banned
      const ban = await banRepo.findOne(hubId, auth.sub);
      if (ban) {
        throw ApiError.forbidden('You are banned from this hub');
      }

      await memberRepo.add(hubId, auth.sub);

      // Audit event
      auditRepo.create(
        auth.sub,
        auth.did,
        AuditAction.MEMBER_JOINED,
        'hub',
        hubId,
        {},
        hubId,
      ).catch((err: unknown) => {
        logger.error({ err }, 'Failed to create join audit event');
      });

      logger.info({ hubId, userId: auth.sub }, 'User joined hub');

      const body: ApiResponse = { ok: true, data: { message: 'Joined hub' } };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /v1/hubs/:id/leave
 *
 * Leave a hub. Removes the caller from hub_members.
 * The hub owner cannot leave.
 *
 * Response: { ok: true, data: { message: "Left hub" } }
 */
hubsRouter.post(
  '/:id/leave',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const hubId = req.params['id'] as string | undefined;

      if (!hubId) {
        throw ApiError.badRequest('Hub ID is required');
      }

      // Verify hub exists
      const hub = await hubRepo.findById(hubId);
      if (!hub) {
        throw ApiError.notFound('Hub not found');
      }

      // Owner cannot leave their own hub
      if (hub.ownerUserId === auth.sub) {
        throw ApiError.badRequest('Hub owner cannot leave the hub');
      }

      const removed = await memberRepo.remove(hubId, auth.sub);
      if (!removed) {
        throw ApiError.badRequest('You are not a member of this hub');
      }

      // Audit event
      auditRepo.create(
        auth.sub,
        auth.did,
        AuditAction.MEMBER_LEFT,
        'hub',
        hubId,
        {},
        hubId,
      ).catch((err: unknown) => {
        logger.error({ err }, 'Failed to create leave audit event');
      });

      logger.info({ hubId, userId: auth.sub }, 'User left hub');

      const body: ApiResponse = { ok: true, data: { message: 'Left hub' } };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// Hub Icon Endpoints
// ---------------------------------------------------------------------------

/** Allowed MIME types for hub icons. */
const ALLOWED_ICON_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif']);

/** Map MIME type to file extension. */
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
};

/** Maximum icon file size: 512 KB. */
const MAX_ICON_SIZE = 512 * 1024;

const iconRateLimit = rateLimit({
  windowMs: 60_000,
  max: 10,
  keyPrefix: 'rl:hub-icon',
  keyExtractor: (req) => req.auth?.sub ?? 'anon',
});

/**
 * Helper: verify hub membership + MANAGE_HUB permission.
 * Returns the hub on success, throws ApiError on failure.
 */
async function requireManageHub(hubId: string, userId: string): Promise<Hub> {
  const membership = await memberRepo.findOne(hubId, userId);
  if (!membership) throw ApiError.forbidden('You are not a member of this hub');

  const channels = await channelRepo.findByHubId(hubId);
  const firstChannel = channels[0];
  if (!firstChannel) throw ApiError.internal('Hub has no channels');

  const hasPerm = await permissionService.checkPermission(
    hubId, firstChannel.id, userId, Permission.MANAGE_HUB,
  );
  if (!hasPerm) throw ApiError.forbidden('Missing MANAGE_HUB permission');

  const hub = await hubRepo.findById(hubId);
  if (!hub) throw ApiError.notFound('Hub not found');

  return hub;
}

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

/**
 * POST /v1/hubs/:id/icon
 *
 * Upload a hub icon image directly (server-proxied to MinIO).
 * Requires MANAGE_HUB permission.
 *
 * Body: raw binary image data with Content-Type header set to the image MIME type.
 * Response: { ok: true, data: { iconUrl: string } }
 */
hubsRouter.post(
  '/:id/icon',
  requireAuth,
  iconRateLimit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const hubId = req.params['id'] as string | undefined;
      if (!hubId) throw ApiError.badRequest('Hub ID is required');

      await requireManageHub(hubId, auth.sub);

      const contentType = req.headers['content-type'] ?? '';
      if (!ALLOWED_ICON_TYPES.has(contentType)) {
        throw ApiError.badRequest('Icon must be JPEG, PNG, or GIF');
      }

      const imageBuffer = collectRawBody(req, MAX_ICON_SIZE);

      logger.info(
        { hubId, actorId: auth.sub, contentType, bodyBytes: imageBuffer.length },
        'Hub icon upload: body received',
      );

      if (imageBuffer.length === 0) {
        throw ApiError.badRequest('No image data received');
      }

      const ext = MIME_TO_EXT[contentType] ?? 'png';
      const storageKey = `hub-icons/${hubId}/${randomUUID()}.${ext}`;

      // Upload directly to MinIO (server-side, no CORS issues)
      await storage.uploadDirect(storageKey, imageBuffer, contentType);

      // Persist storage key to DB
      await hubRepo.updateIconUrl(hubId, storageKey);

      logger.info({ hubId, actorId: auth.sub, storageKey }, 'Hub icon uploaded');

      const body: ApiResponse<{ iconUrl: string }> = {
        ok: true,
        data: { iconUrl: storageKey },
      };
      res.status(200).json(body);
    } catch (err) {
      logger.error({ err, hubId: req.params['id'] }, 'Hub icon upload failed');
      next(err);
    }
  },
);

/**
 * GET /v1/hubs/:id/icon
 *
 * Serve the hub's icon image by proxying it from MinIO.
 * No auth required — hub icons are public, like Discord server icons.
 *
 * Returns 200 with the image body, or 404 if no icon is set.
 */
hubsRouter.get(
  '/:id/icon',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const hubId = req.params['id'] as string | undefined;
      if (!hubId) throw ApiError.badRequest('Hub ID is required');

      const hub = await hubRepo.findById(hubId);
      if (!hub) throw ApiError.notFound('Hub not found');
      if (!hub.iconUrl) throw ApiError.notFound('Hub has no icon');

      const object = await storage.getObject(hub.iconUrl);
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

/**
 * DELETE /v1/hubs/:id/icon
 *
 * Remove the hub's icon. Requires MANAGE_HUB permission.
 *
 * Response: { ok: true, data: { message: "Icon removed" } }
 */
hubsRouter.delete(
  '/:id/icon',
  requireAuth,
  iconRateLimit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const hubId = req.params['id'] as string | undefined;
      if (!hubId) throw ApiError.badRequest('Hub ID is required');

      await requireManageHub(hubId, auth.sub);

      await hubRepo.updateIconUrl(hubId, null);

      logger.info({ hubId, actorId: auth.sub }, 'Hub icon removed');

      const body: ApiResponse = { ok: true, data: { message: 'Icon removed' } };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);
