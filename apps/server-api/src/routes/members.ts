import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  ApiError,
  type ApiResponse,
  Permission,
  AuditAction,
} from '@ripcord/types';
import { requireAuth } from '../middleware/require-auth.js';
import * as memberRepo from '../repositories/member.repo.js';
import * as banRepo from '../repositories/ban.repo.js';
import * as roleRepo from '../repositories/role.repo.js';
import * as hubRepo from '../repositories/server.repo.js';
import * as channelRepo from '../repositories/channel.repo.js';
import * as auditRepo from '../repositories/audit.repo.js';
import * as permissionService from '../services/permission.service.js';
import { logger } from '../logger.js';
import { redis } from '../redis.js';

export const membersRouter: Router = Router();

// ---------------------------------------------------------------------------
// GET /v1/hubs/:hubId/presence — Bulk presence for all hub members
// ---------------------------------------------------------------------------

membersRouter.get(
  '/hubs/:hubId/presence',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const hubId = req.params['hubId'] as string | undefined;

      if (!hubId) {
        throw ApiError.badRequest('Hub ID is required');
      }

      // Verify membership
      const membership = await memberRepo.findOne(hubId, auth.sub);
      if (!membership) {
        throw ApiError.forbidden('You are not a member of this hub');
      }

      // Get all members of this hub
      const members = await memberRepo.findByHub(hubId, 200);

      // Batch-read presence from Redis using pipeline
      const pipeline = redis.pipeline();
      for (const m of members) {
        pipeline.get(`presence:${m.userId}`);
      }
      const results = await pipeline.exec();

      // Build response: array of { userId, status }
      const presenceData = members.map((m, i) => {
        const [err, value] = results?.[i] ?? [null, null];
        const status = !err && (value === 'online' || value === 'idle' || value === 'dnd')
          ? value
          : 'offline';
        return { userId: m.userId, status };
      });

      const body: ApiResponse = { ok: true, data: presenceData };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get the first channel in a hub to use for hub-level permission checks.
 * Mirrors the pattern established in servers.ts.
 */
async function getRefChannelId(hubId: string): Promise<string> {
  const channels = await channelRepo.findByHubId(hubId);
  const first = channels[0];
  if (!first) {
    throw ApiError.internal('Hub has no channels');
  }
  return first.id;
}

// ---------------------------------------------------------------------------
// GET /v1/hubs/:hubId/members
// ---------------------------------------------------------------------------

membersRouter.get(
  '/hubs/:hubId/members',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const hubId = req.params['hubId'] as string | undefined;

      if (!hubId) {
        throw ApiError.badRequest('Hub ID is required');
      }

      // Verify membership
      const membership = await memberRepo.findOne(hubId, auth.sub);
      if (!membership) {
        throw ApiError.forbidden('You are not a member of this hub');
      }

      const limit = Math.min(Number(req.query['limit']) || 50, 100);
      const cursor = req.query['cursor'] as string | undefined;

      const members = await memberRepo.findByHub(hubId, limit, cursor);

      // Attach roles for each member
      const membersWithRoles = await Promise.all(
        members.map(async (m) => {
          const roles = await roleRepo.findRolesForMember(hubId, m.userId);
          return {
            ...m,
            roles: roles.map((r) => ({ id: r.id, name: r.name })),
          };
        }),
      );

      const body: ApiResponse = { ok: true, data: membersWithRoles };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// DELETE /v1/hubs/:hubId/members/:userId  — Kick
// ---------------------------------------------------------------------------

membersRouter.delete(
  '/hubs/:hubId/members/:userId',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const hubId = req.params['hubId'] as string | undefined;
      const targetUserId = req.params['userId'] as string | undefined;

      if (!hubId || !targetUserId) {
        throw ApiError.badRequest('Hub ID and user ID are required');
      }

      // Cannot kick yourself
      if (targetUserId === auth.sub) {
        throw ApiError.badRequest('Cannot kick yourself — use leave instead');
      }

      // Verify hub exists and check if target is the owner
      const hub = await hubRepo.findById(hubId);
      if (!hub) {
        throw ApiError.notFound('Hub not found');
      }
      if (hub.ownerUserId === targetUserId) {
        throw ApiError.forbidden('Cannot kick the hub owner');
      }

      // Verify caller membership
      const membership = await memberRepo.findOne(hubId, auth.sub);
      if (!membership) {
        throw ApiError.forbidden('You are not a member of this hub');
      }

      // Check KICK_MEMBERS permission
      const refChannelId = await getRefChannelId(hubId);
      const hasPerm = await permissionService.checkPermission(
        hubId,
        refChannelId,
        auth.sub,
        Permission.KICK_MEMBERS,
      );
      if (!hasPerm) {
        throw ApiError.forbidden('Missing KICK_MEMBERS permission');
      }

      const removed = await memberRepo.remove(hubId, targetUserId);
      if (!removed) {
        throw ApiError.notFound('Member not found in this hub');
      }

      // Audit event
      auditRepo.create(
        auth.sub,
        auth.did,
        AuditAction.MEMBER_KICKED,
        'user',
        targetUserId,
        { hubId },
        hubId,
      ).catch((err: unknown) => {
        logger.error({ err }, 'Failed to create kick audit event');
      });

      logger.info({ hubId, targetUserId, actorId: auth.sub }, 'Member kicked');

      const body: ApiResponse = { ok: true, data: { message: 'Member kicked' } };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /v1/hubs/:hubId/bans  — Ban
// ---------------------------------------------------------------------------

membersRouter.post(
  '/hubs/:hubId/bans',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const hubId = req.params['hubId'] as string | undefined;
      const { userId: targetUserId, reason } = req.body as { userId?: string; reason?: string };

      if (!hubId || !targetUserId) {
        throw ApiError.badRequest('Hub ID and userId are required');
      }

      // Cannot ban yourself
      if (targetUserId === auth.sub) {
        throw ApiError.badRequest('Cannot ban yourself');
      }

      // Verify hub exists and check if target is the owner
      const hub = await hubRepo.findById(hubId);
      if (!hub) {
        throw ApiError.notFound('Hub not found');
      }
      if (hub.ownerUserId === targetUserId) {
        throw ApiError.forbidden('Cannot ban the hub owner');
      }

      // Verify caller membership
      const membership = await memberRepo.findOne(hubId, auth.sub);
      if (!membership) {
        throw ApiError.forbidden('You are not a member of this hub');
      }

      // Check BAN_MEMBERS permission
      const refChannelId = await getRefChannelId(hubId);
      const hasPerm = await permissionService.checkPermission(
        hubId,
        refChannelId,
        auth.sub,
        Permission.BAN_MEMBERS,
      );
      if (!hasPerm) {
        throw ApiError.forbidden('Missing BAN_MEMBERS permission');
      }

      // Check if already banned
      const existingBan = await banRepo.findOne(hubId, targetUserId);
      if (existingBan) {
        throw ApiError.conflict('User is already banned from this hub');
      }

      // Create ban and remove member
      const ban = await banRepo.create(hubId, targetUserId, auth.sub, reason);
      await memberRepo.remove(hubId, targetUserId);

      // Audit event
      auditRepo.create(
        auth.sub,
        auth.did,
        AuditAction.MEMBER_BANNED,
        'user',
        targetUserId,
        { hubId, reason: reason ?? null },
        hubId,
      ).catch((err: unknown) => {
        logger.error({ err }, 'Failed to create ban audit event');
      });

      logger.info({ hubId, targetUserId, actorId: auth.sub }, 'Member banned');

      const body: ApiResponse = { ok: true, data: ban };
      res.status(201).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// DELETE /v1/hubs/:hubId/bans/:userId  — Unban
// ---------------------------------------------------------------------------

membersRouter.delete(
  '/hubs/:hubId/bans/:userId',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const hubId = req.params['hubId'] as string | undefined;
      const targetUserId = req.params['userId'] as string | undefined;

      if (!hubId || !targetUserId) {
        throw ApiError.badRequest('Hub ID and user ID are required');
      }

      // Verify caller membership
      const membership = await memberRepo.findOne(hubId, auth.sub);
      if (!membership) {
        throw ApiError.forbidden('You are not a member of this hub');
      }

      // Check BAN_MEMBERS permission
      const refChannelId = await getRefChannelId(hubId);
      const hasPerm = await permissionService.checkPermission(
        hubId,
        refChannelId,
        auth.sub,
        Permission.BAN_MEMBERS,
      );
      if (!hasPerm) {
        throw ApiError.forbidden('Missing BAN_MEMBERS permission');
      }

      // Verify ban exists
      const ban = await banRepo.findOne(hubId, targetUserId);
      if (!ban) {
        throw ApiError.notFound('Ban not found');
      }

      await banRepo.remove(hubId, targetUserId);

      // Audit event
      auditRepo.create(
        auth.sub,
        auth.did,
        AuditAction.MEMBER_UNBANNED,
        'user',
        targetUserId,
        { hubId },
        hubId,
      ).catch((err: unknown) => {
        logger.error({ err }, 'Failed to create unban audit event');
      });

      logger.info({ hubId, targetUserId, actorId: auth.sub }, 'Member unbanned');

      const body: ApiResponse = { ok: true, data: { message: 'Member unbanned' } };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /v1/hubs/:hubId/bans  — List bans
// ---------------------------------------------------------------------------

membersRouter.get(
  '/hubs/:hubId/bans',
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

      // Check BAN_MEMBERS permission
      const refChannelId = await getRefChannelId(hubId);
      const hasPerm = await permissionService.checkPermission(
        hubId,
        refChannelId,
        auth.sub,
        Permission.BAN_MEMBERS,
      );
      if (!hasPerm) {
        throw ApiError.forbidden('Missing BAN_MEMBERS permission');
      }

      const bans = await banRepo.findByHub(hubId);

      const body: ApiResponse = { ok: true, data: bans };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /v1/hubs/:hubId/members/:userId/roles  — Assign role
// ---------------------------------------------------------------------------

membersRouter.post(
  '/hubs/:hubId/members/:userId/roles',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const hubId = req.params['hubId'] as string | undefined;
      const targetUserId = req.params['userId'] as string | undefined;
      const { roleId } = req.body as { roleId?: string };

      if (!hubId || !targetUserId || !roleId) {
        throw ApiError.badRequest('Hub ID, user ID, and roleId are required');
      }

      // Verify caller membership
      const membership = await memberRepo.findOne(hubId, auth.sub);
      if (!membership) {
        throw ApiError.forbidden('You are not a member of this hub');
      }

      // Check MANAGE_ROLES permission
      const refChannelId = await getRefChannelId(hubId);
      const hasPerm = await permissionService.checkPermission(
        hubId,
        refChannelId,
        auth.sub,
        Permission.MANAGE_ROLES,
      );
      if (!hasPerm) {
        throw ApiError.forbidden('Missing MANAGE_ROLES permission');
      }

      // Verify target is a member
      const targetMembership = await memberRepo.findOne(hubId, targetUserId);
      if (!targetMembership) {
        throw ApiError.notFound('Target user is not a member of this hub');
      }

      // Verify role belongs to this hub
      const role = await roleRepo.findById(roleId);
      if (!role || role.hubId !== hubId) {
        throw ApiError.notFound('Role not found in this hub');
      }

      await roleRepo.assignRole(hubId, targetUserId, roleId);
      await permissionService.invalidatePermissions(hubId);

      // Audit event
      auditRepo.create(
        auth.sub,
        auth.did,
        AuditAction.ROLE_ASSIGNED,
        'user',
        targetUserId,
        { hubId, roleId, roleName: role.name },
        hubId,
      ).catch((err: unknown) => {
        logger.error({ err }, 'Failed to create role assignment audit event');
      });

      logger.info({ hubId, targetUserId, roleId, actorId: auth.sub }, 'Role assigned');

      const body: ApiResponse = { ok: true, data: { message: 'Role assigned' } };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// DELETE /v1/hubs/:hubId/members/:userId/roles/:roleId  — Remove role
// ---------------------------------------------------------------------------

membersRouter.delete(
  '/hubs/:hubId/members/:userId/roles/:roleId',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const hubId = req.params['hubId'] as string | undefined;
      const targetUserId = req.params['userId'] as string | undefined;
      const roleId = req.params['roleId'] as string | undefined;

      if (!hubId || !targetUserId || !roleId) {
        throw ApiError.badRequest('Hub ID, user ID, and role ID are required');
      }

      // Verify caller membership
      const membership = await memberRepo.findOne(hubId, auth.sub);
      if (!membership) {
        throw ApiError.forbidden('You are not a member of this hub');
      }

      // Check MANAGE_ROLES permission
      const refChannelId = await getRefChannelId(hubId);
      const hasPerm = await permissionService.checkPermission(
        hubId,
        refChannelId,
        auth.sub,
        Permission.MANAGE_ROLES,
      );
      if (!hasPerm) {
        throw ApiError.forbidden('Missing MANAGE_ROLES permission');
      }

      // Verify role belongs to this hub
      const role = await roleRepo.findById(roleId);
      if (!role || role.hubId !== hubId) {
        throw ApiError.notFound('Role not found in this hub');
      }

      await roleRepo.removeRole(hubId, targetUserId, roleId);
      await permissionService.invalidatePermissions(hubId);

      // Audit event
      auditRepo.create(
        auth.sub,
        auth.did,
        AuditAction.ROLE_UNASSIGNED,
        'user',
        targetUserId,
        { hubId, roleId, roleName: role.name },
        hubId,
      ).catch((err: unknown) => {
        logger.error({ err }, 'Failed to create role removal audit event');
      });

      logger.info({ hubId, targetUserId, roleId, actorId: auth.sub }, 'Role removed');

      const body: ApiResponse = { ok: true, data: { message: 'Role removed' } };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);
