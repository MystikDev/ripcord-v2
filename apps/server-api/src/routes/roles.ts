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
import * as roleRepo from '../repositories/role.repo.js';
import * as channelRepo from '../repositories/channel.repo.js';
import * as auditRepo from '../repositories/audit.repo.js';
import * as permissionService from '../services/permission.service.js';
import { redis } from '../redis.js';
import { logger } from '../logger.js';
import { z } from 'zod';

export const rolesRouter: Router = Router();

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const CreateRoleSchema = z.object({
  name: z.string().min(1, 'Role name is required').max(100),
  priority: z.number().int().min(0).default(100),
  bitsetPermissions: z.string().default('0'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex color').optional(),
});

const UpdateRoleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  priority: z.number().int().min(0).optional(),
  bitsetPermissions: z.string().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex color').nullable().optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Broadcast a ROLE_UPDATE event to all channels in a hub so every connected member receives it. */
async function broadcastRoleUpdate(
  hubId: string,
  role: { id: string; name: string; priority: number; color?: string | null },
  action: 'created' | 'updated' | 'deleted',
): Promise<void> {
  try {
    const channels = await channelRepo.findByHubId(hubId);
    const payload = JSON.stringify({ type: 'ROLE_UPDATE', data: { hubId, role, action } });
    await Promise.all(channels.map((ch) => redis.publish(`ch:${ch.id}`, payload)));
  } catch (err) {
    logger.error({ hubId, err }, 'Failed to broadcast role update');
  }
}

async function getRefChannelId(hubId: string): Promise<string> {
  const channels = await channelRepo.findByHubId(hubId);
  const first = channels[0];
  if (!first) {
    throw ApiError.internal('Hub has no channels');
  }
  return first.id;
}

// ---------------------------------------------------------------------------
// POST /v1/hubs/:hubId/roles — Create role
// ---------------------------------------------------------------------------

rolesRouter.post(
  '/hubs/:hubId/roles',
  requireAuth,
  validate(CreateRoleSchema),
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

      const { name, priority, bitsetPermissions, color } = req.body as {
        name: string;
        priority: number;
        bitsetPermissions: string;
        color?: string;
      };

      const role = await roleRepo.create(hubId, name, priority, bitsetPermissions, color);
      await permissionService.invalidatePermissions(hubId);

      // Audit event
      auditRepo.create(
        auth.sub,
        auth.did,
        AuditAction.ROLE_CREATED,
        'role',
        role.id,
        { name, priority, bitsetPermissions },
        hubId,
      ).catch((err: unknown) => {
        logger.error({ err }, 'Failed to create role-created audit event');
      });

      logger.info({ hubId, roleId: role.id, actorId: auth.sub }, 'Role created');

      // Broadcast to all hub members in real-time
      await broadcastRoleUpdate(hubId, role, 'created');

      const body: ApiResponse = { ok: true, data: role };
      res.status(201).json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// PATCH /v1/hubs/:hubId/roles/:roleId — Update role
// ---------------------------------------------------------------------------

rolesRouter.patch(
  '/hubs/:hubId/roles/:roleId',
  requireAuth,
  validate(UpdateRoleSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const hubId = req.params['hubId'] as string | undefined;
      const roleId = req.params['roleId'] as string | undefined;

      if (!hubId || !roleId) {
        throw ApiError.badRequest('Hub ID and role ID are required');
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
      const existingRole = await roleRepo.findById(roleId);
      if (!existingRole || existingRole.hubId !== hubId) {
        throw ApiError.notFound('Role not found in this hub');
      }

      // Cannot edit roles above actor's highest role (unless admin)
      const actorRoles = await roleRepo.findRolesForMember(hubId, auth.sub);
      const isAdmin = await permissionService.checkPermission(
        hubId,
        refChannelId,
        auth.sub,
        Permission.ADMINISTRATOR,
      );

      if (!isAdmin) {
        const actorHighestPriority = actorRoles.length > 0
          ? Math.min(...actorRoles.map((r) => r.priority))
          : Infinity;

        if (existingRole.priority < actorHighestPriority) {
          throw ApiError.forbidden('Cannot edit a role with higher rank than your own');
        }
      }

      const updates = req.body as {
        name?: string;
        priority?: number;
        bitsetPermissions?: string;
        color?: string | null;
      };

      const updated = await roleRepo.update(roleId, updates);
      if (!updated) {
        throw ApiError.internal('Failed to update role');
      }

      await permissionService.invalidatePermissions(hubId);

      // Audit event
      auditRepo.create(
        auth.sub,
        auth.did,
        AuditAction.ROLE_UPDATED,
        'role',
        roleId,
        { name: updates.name, priority: updates.priority, bitsetPermissions: updates.bitsetPermissions },
        hubId,
      ).catch((err: unknown) => {
        logger.error({ err }, 'Failed to create role-updated audit event');
      });

      logger.info({ hubId, roleId, actorId: auth.sub }, 'Role updated');

      // Broadcast to all hub members in real-time
      await broadcastRoleUpdate(hubId, updated, 'updated');

      const body: ApiResponse = { ok: true, data: updated };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// DELETE /v1/hubs/:hubId/roles/:roleId — Delete role
// ---------------------------------------------------------------------------

rolesRouter.delete(
  '/hubs/:hubId/roles/:roleId',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const hubId = req.params['hubId'] as string | undefined;
      const roleId = req.params['roleId'] as string | undefined;

      if (!hubId || !roleId) {
        throw ApiError.badRequest('Hub ID and role ID are required');
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
      const existingRole = await roleRepo.findById(roleId);
      if (!existingRole || existingRole.hubId !== hubId) {
        throw ApiError.notFound('Role not found in this hub');
      }

      // Cannot delete @everyone
      if (existingRole.name === '@everyone') {
        throw ApiError.forbidden('Cannot delete the @everyone role');
      }

      // Cannot delete roles above actor's rank (unless admin)
      const isAdmin = await permissionService.checkPermission(
        hubId,
        refChannelId,
        auth.sub,
        Permission.ADMINISTRATOR,
      );

      if (!isAdmin) {
        const actorRoles = await roleRepo.findRolesForMember(hubId, auth.sub);
        const actorHighestPriority = actorRoles.length > 0
          ? Math.min(...actorRoles.map((r) => r.priority))
          : Infinity;

        if (existingRole.priority < actorHighestPriority) {
          throw ApiError.forbidden('Cannot delete a role with higher rank than your own');
        }
      }

      await roleRepo.deleteRole(roleId);
      await permissionService.invalidatePermissions(hubId);

      // Audit event
      auditRepo.create(
        auth.sub,
        auth.did,
        AuditAction.ROLE_DELETED,
        'role',
        roleId,
        { name: existingRole.name, hubId },
        hubId,
      ).catch((err: unknown) => {
        logger.error({ err }, 'Failed to create role-deleted audit event');
      });

      logger.info({ hubId, roleId, actorId: auth.sub }, 'Role deleted');

      // Broadcast to all hub members in real-time
      await broadcastRoleUpdate(hubId, existingRole, 'deleted');

      const body: ApiResponse = { ok: true, data: { message: 'Role deleted' } };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);
