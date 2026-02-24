import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  ApiError,
  type ApiResponse,
  Permission,
  AuditAction,
} from '@ripcord/types';
import { requireAuth } from '../middleware/require-auth.js';
import { validate } from '../middleware/validate.js';
import * as memberRepo from '../repositories/member.repo.js';
import * as banRepo from '../repositories/ban.repo.js';
import * as hubRepo from '../repositories/server.repo.js';
import * as channelRepo from '../repositories/channel.repo.js';
import * as inviteRepo from '../repositories/invite.repo.js';
import * as auditRepo from '../repositories/audit.repo.js';
import * as permissionService from '../services/permission.service.js';
import { logger } from '../logger.js';
import { z } from 'zod';

export const invitesRouter: Router = Router();

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const CreateInviteSchema = z.object({
  maxUses: z.number().int().min(1).max(1000).optional(),
  expiresAt: z.string().datetime().optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getRefChannelId(hubId: string): Promise<string> {
  const channels = await channelRepo.findByHubId(hubId);
  const first = channels[0];
  if (!first) {
    throw ApiError.internal('Hub has no channels');
  }
  return first.id;
}

// ---------------------------------------------------------------------------
// POST /v1/hubs/:hubId/invites — Create invite
// ---------------------------------------------------------------------------

invitesRouter.post(
  '/hubs/:hubId/invites',
  requireAuth,
  validate(CreateInviteSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const hubId = req.params['hubId'] as string | undefined;

      if (!hubId) {
        throw ApiError.badRequest('Hub ID is required');
      }

      // Verify caller membership
      const membership = await memberRepo.findOne(hubId, auth.sub);
      if (!membership) {
        throw ApiError.forbidden('You are not a member of this hub');
      }

      // Check MANAGE_HUB permission
      const refChannelId = await getRefChannelId(hubId);
      const hasPerm = await permissionService.checkPermission(
        hubId,
        refChannelId,
        auth.sub,
        Permission.MANAGE_HUB,
      );
      if (!hasPerm) {
        throw ApiError.forbidden('Missing MANAGE_HUB permission');
      }

      const { maxUses, expiresAt } = req.body as {
        maxUses?: number;
        expiresAt?: string;
      };

      const invite = await inviteRepo.create(hubId, auth.sub, maxUses, expiresAt);

      logger.info({ hubId, inviteId: invite.id, actorId: auth.sub }, 'Invite created');

      const body: ApiResponse = { ok: true, data: invite };
      res.status(201).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /v1/hubs/:hubId/invites — List invites
// ---------------------------------------------------------------------------

invitesRouter.get(
  '/hubs/:hubId/invites',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const hubId = req.params['hubId'] as string | undefined;

      if (!hubId) {
        throw ApiError.badRequest('Hub ID is required');
      }

      // Verify caller membership
      const membership = await memberRepo.findOne(hubId, auth.sub);
      if (!membership) {
        throw ApiError.forbidden('You are not a member of this hub');
      }

      // Check MANAGE_HUB permission
      const refChannelId = await getRefChannelId(hubId);
      const hasPerm = await permissionService.checkPermission(
        hubId,
        refChannelId,
        auth.sub,
        Permission.MANAGE_HUB,
      );
      if (!hasPerm) {
        throw ApiError.forbidden('Missing MANAGE_HUB permission');
      }

      const invites = await inviteRepo.findByHub(hubId);
      const body: ApiResponse = { ok: true, data: invites };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// DELETE /v1/hubs/:hubId/invites/:inviteId — Revoke invite
// ---------------------------------------------------------------------------

invitesRouter.delete(
  '/hubs/:hubId/invites/:inviteId',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const hubId = req.params['hubId'] as string | undefined;
      const inviteId = req.params['inviteId'] as string | undefined;

      if (!hubId || !inviteId) {
        throw ApiError.badRequest('Hub ID and invite ID are required');
      }

      // Verify caller membership
      const membership = await memberRepo.findOne(hubId, auth.sub);
      if (!membership) {
        throw ApiError.forbidden('You are not a member of this hub');
      }

      // Check MANAGE_HUB permission
      const refChannelId = await getRefChannelId(hubId);
      const hasPerm = await permissionService.checkPermission(
        hubId,
        refChannelId,
        auth.sub,
        Permission.MANAGE_HUB,
      );
      if (!hasPerm) {
        throw ApiError.forbidden('Missing MANAGE_HUB permission');
      }

      // Verify the invite actually belongs to this hub
      const invite = await inviteRepo.findByHub(hubId);
      const target = invite.find((i) => i.id === inviteId);
      if (!target) {
        throw ApiError.notFound('Invite not found in this hub');
      }

      await inviteRepo.deleteInvite(inviteId);

      logger.info({ hubId, inviteId, actorId: auth.sub }, 'Invite revoked');

      const body: ApiResponse = { ok: true, data: { message: 'Invite revoked' } };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /v1/invites/:code/accept — Accept invite
// ---------------------------------------------------------------------------

invitesRouter.post(
  '/invites/:code/accept',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const code = req.params['code'] as string | undefined;

      if (!code) {
        throw ApiError.badRequest('Invite code is required');
      }

      // Find invite
      const invite = await inviteRepo.findByCode(code);
      if (!invite) {
        throw ApiError.notFound('Invalid invite code');
      }

      // Check expiry
      if (invite.expiresAt) {
        const expiresAt = new Date(invite.expiresAt);
        if (expiresAt < new Date()) {
          throw ApiError.badRequest('Invite has expired');
        }
      }

      // Check max uses (preliminary check; the atomic claim below is authoritative)
      if (invite.maxUses !== null && invite.uses >= invite.maxUses) {
        throw ApiError.badRequest('Invite has been used the maximum number of times');
      }

      // Verify hub exists
      const hub = await hubRepo.findById(invite.hubId);
      if (!hub) {
        throw ApiError.notFound('Hub not found');
      }

      // Check if user is banned
      const ban = await banRepo.findOne(invite.hubId, auth.sub);
      if (ban) {
        throw ApiError.forbidden('You are banned from this hub');
      }

      // Check if already a member
      const existingMember = await memberRepo.findOne(invite.hubId, auth.sub);
      if (existingMember) {
        throw ApiError.conflict('You are already a member of this hub');
      }

      // Atomically claim the invite use (race-condition safe)
      const claimed = await inviteRepo.claimUse(invite.id);
      if (!claimed) {
        throw ApiError.badRequest('Invite has been used the maximum number of times');
      }

      // Join hub
      await memberRepo.add(invite.hubId, auth.sub);

      // Audit event
      auditRepo.create(
        auth.sub,
        auth.did,
        AuditAction.MEMBER_JOINED,
        'hub',
        invite.hubId,
        { inviteCode: code },
        invite.hubId,
      ).catch((err: unknown) => {
        logger.error({ err }, 'Failed to create invite-join audit event');
      });

      logger.info({ hubId: invite.hubId, userId: auth.sub, inviteCode: code }, 'User joined via invite');

      const body: ApiResponse = {
        ok: true,
        data: {
          message: 'Joined hub',
          hubId: invite.hubId,
          hubName: hub.name,
        },
      };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /v1/invites/:code — Get invite info (public, for preview)
// ---------------------------------------------------------------------------

invitesRouter.get(
  '/invites/:code',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const code = req.params['code'] as string | undefined;

      if (!code) {
        throw ApiError.badRequest('Invite code is required');
      }

      const invite = await inviteRepo.findByCode(code);
      if (!invite) {
        throw ApiError.notFound('Invalid invite code');
      }

      // Check if expired
      const isExpired = invite.expiresAt ? new Date(invite.expiresAt) < new Date() : false;
      const isExhausted = invite.maxUses !== null ? invite.uses >= invite.maxUses : false;

      // Fetch hub name for the preview
      const hub = await hubRepo.findById(invite.hubId);

      const body: ApiResponse = {
        ok: true,
        data: {
          code: invite.code,
          hubId: invite.hubId,
          hubName: hub?.name ?? 'Unknown Hub',
          isExpired,
          isExhausted,
        },
      };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);
