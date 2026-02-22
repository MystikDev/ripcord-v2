import { Router, type Request, type Response, type NextFunction } from 'express';
import { ApiError, type ApiResponse, Permission } from '@ripcord/types';
import { requireAuth } from '../middleware/require-auth.js';
import * as memberRepo from '../repositories/member.repo.js';
import * as channelRepo from '../repositories/channel.repo.js';
import * as auditRepo from '../repositories/audit.repo.js';
import type { AuditEventRow } from '../repositories/audit.repo.js';
import * as permissionService from '../services/permission.service.js';

export const auditRouter: Router = Router({ mergeParams: true });

/**
 * GET /v1/hubs/:hubId/audit-log
 *
 * Returns paginated audit events for a hub.
 * Requires MANAGE_HUB or ADMINISTRATOR permission.
 *
 * Query params:
 *   action  - Filter by action type (e.g. "HUB_CREATED")
 *   actorId - Filter by actor user ID
 *   before  - ISO timestamp upper bound
 *   after   - ISO timestamp lower bound
 *   cursor  - Event ID for keyset pagination
 *   limit   - Number of results (default 50, max 100)
 */
auditRouter.get(
  '/',
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

      // Check MANAGE_HUB permission (requires a channel reference)
      const channels = await channelRepo.findByHubId(hubId);
      const refChannel = channels[0];
      if (!refChannel) {
        throw ApiError.internal('Hub has no channels');
      }

      const hasPerm = await permissionService.checkPermission(
        hubId,
        refChannel.id,
        auth.sub,
        Permission.MANAGE_HUB,
      );
      if (!hasPerm) {
        throw ApiError.forbidden('Missing MANAGE_HUB permission');
      }

      // Parse query filters
      const action = req.query['action'] as string | undefined;
      const actorId = req.query['actorId'] as string | undefined;
      const before = req.query['before'] as string | undefined;
      const after = req.query['after'] as string | undefined;
      const cursor = req.query['cursor'] as string | undefined;
      const limitRaw = req.query['limit'] as string | undefined;
      const limit = limitRaw ? Math.max(1, Math.min(100, Number(limitRaw))) : undefined;

      const events = await auditRepo.findByHub(hubId, {
        action,
        actorId,
        before,
        after,
        cursor,
        limit,
      });

      const body: ApiResponse<AuditEventRow[]> = { ok: true, data: events };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);
