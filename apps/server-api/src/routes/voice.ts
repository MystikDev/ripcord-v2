import { Router, type Request, type Response, type NextFunction } from 'express';
import { ApiError, type ApiResponse, Permission, ChannelType } from '@ripcord/types';
import type { VoiceParticipant } from '@ripcord/types';
import { env } from '@ripcord/config';
import { queryOne } from '@ripcord/db';
import { requireAuth } from '../middleware/require-auth.js';
import * as channelRepo from '../repositories/channel.repo.js';
import * as memberRepo from '../repositories/member.repo.js';
import * as permissionService from '../services/permission.service.js';
import * as voiceService from '../services/voice.service.js';
import { redis } from '../redis.js';

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
