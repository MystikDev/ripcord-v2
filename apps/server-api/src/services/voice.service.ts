import { AccessToken } from 'livekit-server-sdk';
import { env } from '@ripcord/config';
import { ApiError } from '@ripcord/types';

/**
 * Generate a LiveKit access token for a user to join a voice channel.
 *
 * The room name is the channel ID. The participant identity is the user ID.
 * The participant name is the user's display handle.
 * Grants: room join, publish audio/video, subscribe.
 *
 * @param channelId - The voice channel UUID (used as room name).
 * @param userId - The user's UUID (used as participant identity).
 * @param handle - The user's display handle (used as participant name).
 * @returns The signed JWT token string.
 * @throws {ApiError} 503 if LiveKit is not configured.
 */
export async function generateVoiceToken(
  channelId: string,
  userId: string,
  handle?: string,
): Promise<string> {
  if (!env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
    throw ApiError.internal('Voice service is not configured');
  }

  const token = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
    identity: userId,
    name: handle ?? userId,
    ttl: '1h',
  });

  token.addGrant({
    room: channelId,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
  });

  return token.toJwt();
}
