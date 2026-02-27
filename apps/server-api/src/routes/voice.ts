import { Router, type Request, type Response, type NextFunction } from 'express';
import { ApiError, type ApiResponse, Permission, ChannelType } from '@ripcord/types';
import type { VoiceParticipant } from '@ripcord/types';
import { env } from '@ripcord/config';
import { queryOne } from '@ripcord/db';
import { requireAuth } from '../middleware/require-auth.js';
import * as channelRepo from '../repositories/channel.repo.js';
import * as memberRepo from '../repositories/member.repo.js';
import * as dmRepo from '../repositories/dm.repo.js';
import * as permissionService from '../services/permission.service.js';
import * as voiceService from '../services/voice.service.js';
import { redis } from '../redis.js';
import { logger } from '../logger.js';

export const voiceRouter: Router = Router();

/**
 * POST /v1/voice/token
 *
 * Generate a LiveKit access token for joining a voice channel.
 * Requires CONNECT_VOICE permission.
 *
 * Body: { channelId: string }
 * Response: { ok: true, data: { token: string } }
 */
voiceRouter.post(
  '/token',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const body = req.body as { channelId?: string };
      const channelId = body.channelId;

      if (!channelId) {
        throw ApiError.badRequest('channelId is required');
      }

      // Verify channel exists and is a voice channel
      const channel = await channelRepo.findById(channelId);
      if (!channel) {
        throw ApiError.notFound('Channel not found');
      }

      if (channel.type !== ChannelType.VOICE) {
        throw ApiError.badRequest('Channel is not a voice channel');
      }

      if (!channel.hubId) {
        throw ApiError.badRequest('Channel is not part of a hub');
      }

      // Verify membership
      const membership = await memberRepo.findOne(channel.hubId, auth.sub);
      if (!membership) {
        throw ApiError.forbidden('You are not a member of this hub');
      }

      // Check CONNECT_VOICE permission
      const hasPerm = await permissionService.checkPermission(
        channel.hubId,
        channelId,
        auth.sub,
        Permission.CONNECT_VOICE,
      );
      if (!hasPerm) {
        throw ApiError.forbidden('Missing CONNECT_VOICE permission');
      }

      // Resolve handle for LiveKit participant name
      const userRow = await queryOne<{ handle: string }>(
        'SELECT handle FROM users WHERE id = $1',
        [auth.sub],
      );

      const token = await voiceService.generateVoiceToken(channelId, auth.sub, userRow?.handle);
      const url = env.LIVEKIT_PUBLIC_URL ?? env.LIVEKIT_URL ?? 'ws://localhost:7880';

      const responseBody: ApiResponse<{ token: string; url: string }> = {
        ok: true,
        data: { token, url },
      };
      res.json(responseBody);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /v1/voice/dm-token
 *
 * Generate a LiveKit access token for a DM call.
 * Uses a deterministic ephemeral room name based on sorted user IDs.
 * Only requires the caller to be a DM participant (no hub permission check).
 *
 * Body: { channelId: string }
 * Response: { ok: true, data: { token: string; url: string; roomId: string } }
 */
voiceRouter.post(
  '/dm-token',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const body = req.body as { channelId?: string };
      const channelId = body.channelId;

      if (!channelId) {
        throw ApiError.badRequest('channelId is required');
      }

      // Verify channel exists and is a DM channel
      const channel = await channelRepo.findById(channelId);
      if (!channel) {
        throw ApiError.notFound('Channel not found');
      }

      if (channel.hubId !== null) {
        throw ApiError.badRequest('Channel is not a DM channel — use /v1/voice/token instead');
      }

      // Verify the caller is a DM participant
      const isParticipant = await dmRepo.isParticipant(channelId, auth.sub);
      if (!isParticipant) {
        throw ApiError.forbidden('You are not a participant in this DM');
      }

      // Deterministic room name: dm-call:<sorted user IDs>
      // This ensures both users get the same room
      const roomId = `dm-call:${channelId}`;

      // Resolve handle
      const userRow = await queryOne<{ handle: string }>(
        'SELECT handle FROM users WHERE id = $1',
        [auth.sub],
      );

      const token = await voiceService.generateVoiceToken(roomId, auth.sub, userRow?.handle);
      const url = env.LIVEKIT_PUBLIC_URL ?? env.LIVEKIT_URL ?? 'ws://localhost:7880';

      const responseBody: ApiResponse<{ token: string; url: string; roomId: string }> = {
        ok: true,
        data: { token, url, roomId },
      };
      res.json(responseBody);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /v1/voice/states/:hubId
 *
 * Hydrate voice channel participants for an entire hub.
 * Returns a map of channelId → VoiceParticipant[] for all voice channels
 * that have at least one participant.
 *
 * Response: { ok: true, data: Record<string, VoiceParticipant[]> }
 */
voiceRouter.get(
  '/states/:hubId',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const hubId = req.params.hubId as string;

      if (!hubId) {
        throw ApiError.badRequest('hubId is required');
      }

      // Verify membership
      const membership = await memberRepo.findOne(hubId, auth.sub);
      if (!membership) {
        throw ApiError.forbidden('You are not a member of this hub');
      }

      // Get all voice channels for this hub
      const channels = await channelRepo.findByHubId(hubId);
      const voiceChannels = channels.filter((ch) => ch.type === ChannelType.VOICE);

      // Fetch voice state from Redis for each voice channel
      const result: Record<string, VoiceParticipant[]> = {};

      for (const channel of voiceChannels) {
        const key = `voice:${channel.id}`;
        const entries = await redis.hgetall(key);
        const participants: VoiceParticipant[] = [];

        for (const raw of Object.values(entries)) {
          try {
            participants.push(JSON.parse(raw));
          } catch {
            // Skip malformed entries
          }
        }

        if (participants.length > 0) {
          result[channel.id] = participants;
        }
      }

      const responseBody: ApiResponse<Record<string, VoiceParticipant[]>> = {
        ok: true,
        data: result,
      };
      res.json(responseBody);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// Admin voice actions
// ---------------------------------------------------------------------------

/**
 * POST /v1/voice/move
 *
 * Move a user from one voice channel to another.
 * Requires MOVE_MEMBERS permission in the source channel.
 *
 * Body: { hubId, channelId, targetChannelId, userId }
 */
voiceRouter.post(
  '/move',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const body = req.body as {
        hubId?: string;
        channelId?: string;
        targetChannelId?: string;
        userId?: string;
      };

      if (!body.hubId || !body.channelId || !body.targetChannelId || !body.userId) {
        throw ApiError.badRequest('hubId, channelId, targetChannelId, and userId are required');
      }

      if (body.userId === auth.sub) {
        throw ApiError.badRequest('Cannot move yourself — switch channels directly');
      }

      // Verify actor membership
      const membership = await memberRepo.findOne(body.hubId, auth.sub);
      if (!membership) {
        throw ApiError.forbidden('You are not a member of this hub');
      }

      // Check MOVE_MEMBERS permission
      const hasPerm = await permissionService.checkPermission(
        body.hubId,
        body.channelId,
        auth.sub,
        Permission.MOVE_MEMBERS,
      );
      if (!hasPerm) {
        throw ApiError.forbidden('Missing MOVE_MEMBERS permission');
      }

      // Verify target user is in source channel
      const participantRaw = await redis.hget(`voice:${body.channelId}`, body.userId);
      if (!participantRaw) {
        throw ApiError.notFound('User is not in the source voice channel');
      }
      const participant: VoiceParticipant = JSON.parse(participantRaw);

      // Verify target channel is a voice channel in the same hub
      const targetChannel = await channelRepo.findById(body.targetChannelId);
      if (!targetChannel || targetChannel.type !== ChannelType.VOICE) {
        throw ApiError.badRequest('Target channel is not a voice channel');
      }
      if (targetChannel.hubId !== body.hubId) {
        throw ApiError.badRequest('Target channel is not in the same hub');
      }

      // Move in Redis: remove from source, add to target
      await redis.hdel(`voice:${body.channelId}`, body.userId);
      const movedParticipant: VoiceParticipant = {
        ...participant,
        joinedAt: new Date().toISOString(),
      };
      await redis.hset(
        `voice:${body.targetChannelId}`,
        body.userId,
        JSON.stringify(movedParticipant),
      );
      await redis.expire(`voice:${body.targetChannelId}`, 90);

      // Broadcast leave to source channel
      try {
        await redis.publish(`ch:${body.channelId}`, JSON.stringify({
          type: 'VOICE_STATE_UPDATE',
          data: { channelId: body.channelId, userId: body.userId, action: 'leave' },
        }));
      } catch (err) {
        logger.error({ err }, 'Failed to publish voice leave on move');
      }

      // Broadcast join to target channel
      try {
        await redis.publish(`ch:${body.targetChannelId}`, JSON.stringify({
          type: 'VOICE_STATE_UPDATE',
          data: {
            channelId: body.targetChannelId,
            userId: body.userId,
            handle: participant.handle,
            action: 'join',
            selfMute: participant.selfMute,
            selfDeaf: participant.selfDeaf,
            serverMute: participant.serverMute,
          },
        }));
      } catch (err) {
        logger.error({ err }, 'Failed to publish voice join on move');
      }

      // Send force_move to source channel so the moved user's client switches
      try {
        await redis.publish(`ch:${body.channelId}`, JSON.stringify({
          type: 'VOICE_STATE_UPDATE',
          data: {
            channelId: body.channelId,
            userId: body.userId,
            action: 'force_move',
            targetChannelId: body.targetChannelId,
          },
        }));
      } catch (err) {
        logger.error({ err }, 'Failed to publish force_move event');
      }

      const responseBody: ApiResponse<{ moved: true }> = { ok: true, data: { moved: true } };
      res.json(responseBody);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /v1/voice/server-mute
 *
 * Server-mute or unmute a user in a voice channel.
 * Requires MUTE_MEMBERS permission.
 *
 * Body: { hubId, channelId, userId, muted: boolean }
 */
voiceRouter.post(
  '/server-mute',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const body = req.body as {
        hubId?: string;
        channelId?: string;
        userId?: string;
        muted?: boolean;
      };

      if (!body.hubId || !body.channelId || !body.userId || body.muted === undefined) {
        throw ApiError.badRequest('hubId, channelId, userId, and muted are required');
      }

      // Verify actor membership
      const membership = await memberRepo.findOne(body.hubId, auth.sub);
      if (!membership) {
        throw ApiError.forbidden('You are not a member of this hub');
      }

      // Check MUTE_MEMBERS permission
      const hasPerm = await permissionService.checkPermission(
        body.hubId,
        body.channelId,
        auth.sub,
        Permission.MUTE_MEMBERS,
      );
      if (!hasPerm) {
        throw ApiError.forbidden('Missing MUTE_MEMBERS permission');
      }

      // Verify target user is in channel
      const participantRaw = await redis.hget(`voice:${body.channelId}`, body.userId);
      if (!participantRaw) {
        throw ApiError.notFound('User is not in this voice channel');
      }
      const participant: VoiceParticipant = JSON.parse(participantRaw);

      // Update serverMute in Redis
      participant.serverMute = body.muted;
      await redis.hset(`voice:${body.channelId}`, body.userId, JSON.stringify(participant));

      // Broadcast server_mute event
      try {
        await redis.publish(`ch:${body.channelId}`, JSON.stringify({
          type: 'VOICE_STATE_UPDATE',
          data: {
            channelId: body.channelId,
            userId: body.userId,
            action: 'server_mute',
            serverMute: body.muted,
          },
        }));
      } catch (err) {
        logger.error({ err }, 'Failed to publish server_mute event');
      }

      const responseBody: ApiResponse<{ serverMute: boolean }> = {
        ok: true,
        data: { serverMute: body.muted },
      };
      res.json(responseBody);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /v1/voice/permissions/:hubId
 *
 * Get the authenticated user's computed permission bitfield for a hub.
 *
 * Response: { ok: true, data: { permissions: number } }
 */
voiceRouter.get(
  '/permissions/:hubId',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const hubId = req.params.hubId as string;

      if (!hubId) {
        throw ApiError.badRequest('hubId is required');
      }

      // Verify membership
      const membership = await memberRepo.findOne(hubId, auth.sub);
      if (!membership) {
        throw ApiError.forbidden('You are not a member of this hub');
      }

      // Use the first channel for hub-level permission resolution
      const channels = await channelRepo.findByHubId(hubId);
      const firstChannel = channels[0];

      if (!firstChannel) {
        const responseBody: ApiResponse<{ permissions: number }> = {
          ok: true,
          data: { permissions: 0 },
        };
        res.json(responseBody);
        return;
      }

      const permissions = await permissionService.resolvePermissions(hubId, firstChannel.id, auth.sub);
      const responseBody: ApiResponse<{ permissions: number }> = {
        ok: true,
        data: { permissions },
      };
      res.json(responseBody);
    } catch (err) {
      next(err);
    }
  },
);
