import { apiFetch } from './api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HubResponse {
  id: string;
  name: string;
  ownerUserId: string;
  iconUrl?: string;
  createdAt: string;
}

export interface ChannelResponse {
  id: string;
  hubId: string;
  name: string;
  type: 'text' | 'voice';
  isPrivate: boolean;
  createdAt: string;
}

export interface MessageResponse {
  id: string;
  channelId: string;
  senderUserId: string;
  senderDeviceId: string;
  envelope: {
    ciphertext: string;
    nonce: string;
    keyId: string;
    [key: string]: unknown;
  };
  createdAt: string;
  deletedAt: string | null;
}

export interface MemberResponse {
  userId: string;
  handle: string;
  avatarUrl?: string;
  joinedAt: string;
  roles?: Array<{ id: string; name: string }>;
}

export interface ReadStateResponse {
  userId: string;
  channelId: string;
  lastReadMessageId: string | null;
  lastReadAt: string;
  mentionCount: number;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/** Fetch all hubs the current user is a member of. */
export async function fetchMyHubs(): Promise<HubResponse[]> {
  const res = await apiFetch<HubResponse[]>('/v1/hubs');
  if (!res.ok || !res.data) throw new Error(res.error ?? 'Failed to fetch hubs');
  return res.data;
}

/** Fetch all channels in a hub visible to the current user. */
export async function fetchChannels(hubId: string): Promise<ChannelResponse[]> {
  const res = await apiFetch<ChannelResponse[]>(`/v1/hubs/${hubId}/channels`);
  if (!res.ok || !res.data) throw new Error(res.error ?? 'Failed to fetch channels');
  return res.data;
}

/** Fetch message history for a channel with optional cursor pagination. */
export async function fetchMessages(
  channelId: string,
  cursor?: string,
): Promise<MessageResponse[]> {
  const params = cursor ? `?cursor=${cursor}` : '';
  const res = await apiFetch<MessageResponse[]>(
    `/v1/channels/${channelId}/messages${params}`,
  );
  if (!res.ok || !res.data) throw new Error(res.error ?? 'Failed to fetch messages');
  return res.data;
}

/** Create a new hub. */
export async function createHub(name: string): Promise<HubResponse> {
  const res = await apiFetch<HubResponse>('/v1/hubs', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  if (!res.ok || !res.data) throw new Error(res.error ?? 'Failed to create hub');
  return res.data;
}

/** Create a new channel in a hub. */
export async function createChannel(
  hubId: string,
  name: string,
  type: 'text' | 'voice',
): Promise<ChannelResponse> {
  const res = await apiFetch<ChannelResponse>(
    `/v1/hubs/${hubId}/channels`,
    {
      method: 'POST',
      body: JSON.stringify({ name, type }),
    },
  );
  if (!res.ok || !res.data) throw new Error(res.error ?? 'Failed to create channel');
  return res.data;
}

/** Send a message to a channel. */
export async function sendMessage(
  channelId: string,
  senderUserId: string,
  senderDeviceId: string,
  content: string,
): Promise<void> {
  const res = await apiFetch('/v1/messages/send', {
    method: 'POST',
    body: JSON.stringify({
      envelopeVersion: 1,
      channelId,
      senderUserId,
      senderDeviceId,
      sentAt: new Date().toISOString(),
      // TODO: Replace with real E2EE encryption in a future sprint
      ciphertext: btoa(unescape(encodeURIComponent(content))),
      nonce: btoa(String(Date.now())),
      keyId: 'dev-key-placeholder',
    }),
  });
  if (!res.ok) throw new Error(res.error ?? 'Failed to send message');
}

/** Fetch all members of a hub (with handles). */
export async function fetchMembers(hubId: string): Promise<MemberResponse[]> {
  const res = await apiFetch<MemberResponse[]>(`/v1/hubs/${hubId}/members`);
  if (!res.ok || !res.data) throw new Error(res.error ?? 'Failed to fetch members');
  return res.data;
}

/** Fetch all read states for the current user. */
export async function fetchReadStates(): Promise<ReadStateResponse[]> {
  const res = await apiFetch<ReadStateResponse[]>('/v1/read-states');
  if (!res.ok || !res.data) throw new Error(res.error ?? 'Failed to fetch read states');
  return res.data;
}

/** Mark a channel as read up to a specific message. */
export async function markChannelRead(channelId: string, lastReadMessageId: string): Promise<void> {
  const res = await apiFetch(`/v1/channels/${channelId}/read-state`, {
    method: 'PUT',
    body: JSON.stringify({ lastReadMessageId }),
  });
  if (!res.ok) throw new Error(res.error ?? 'Failed to mark channel as read');
}

// ---------------------------------------------------------------------------
// Hub Icon
// ---------------------------------------------------------------------------

/**
 * Upload a hub icon image.
 *
 * Sends the file directly to the API server which proxies it to MinIO.
 * This avoids cross-origin issues with direct MinIO uploads from the browser.
 *
 * @returns The storage key for the uploaded icon.
 */
export async function uploadHubIcon(hubId: string, file: File): Promise<string> {
  const res = await apiFetch<{ iconUrl: string }>(
    `/v1/hubs/${hubId}/icon`,
    {
      method: 'POST',
      body: file,
      headers: { 'Content-Type': file.type },
    },
  );
  if (!res.ok || !res.data) throw new Error(res.error ?? 'Failed to upload icon');

  return res.data.iconUrl;
}

/** Remove the hub's icon. */
export async function deleteHubIcon(hubId: string): Promise<void> {
  const res = await apiFetch(`/v1/hubs/${hubId}/icon`, { method: 'DELETE' });
  if (!res.ok) throw new Error(res.error ?? 'Failed to remove icon');
}

/** Get the API proxy URL for a hub's icon. */
export function getHubIconUrl(hubId: string): string {
  return `/v1/hubs/${hubId}/icon`;
}
