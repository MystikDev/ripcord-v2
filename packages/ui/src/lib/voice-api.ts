import { apiFetch } from './api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VoiceTokenResponse {
  token: string;
  url: string;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/**
 * Requests a LiveKit access token for the given voice channel.
 * The returned `url` is the LiveKit server URL to connect to.
 */
export async function getVoiceToken(channelId: string): Promise<VoiceTokenResponse> {
  const res = await apiFetch<VoiceTokenResponse>('/v1/voice/token', {
    method: 'POST',
    body: JSON.stringify({ channelId }),
  });

  if (!res.ok || !res.data) {
    throw new Error(res.error ?? 'Failed to get voice token');
  }

  return res.data;
}

// ---------------------------------------------------------------------------
// DM Call Token
// ---------------------------------------------------------------------------

export interface DmVoiceTokenResponse {
  token: string;
  url: string;
  roomId: string;
}

/**
 * Requests a LiveKit access token for a DM call.
 * Returns the token, LiveKit server URL, and the deterministic room ID.
 */
export async function getDmVoiceToken(channelId: string): Promise<DmVoiceTokenResponse> {
  const res = await apiFetch<DmVoiceTokenResponse>('/v1/voice/dm-token', {
    method: 'POST',
    body: JSON.stringify({ channelId }),
  });

  if (!res.ok || !res.data) {
    throw new Error(res.error ?? 'Failed to get DM voice token');
  }

  return res.data;
}
