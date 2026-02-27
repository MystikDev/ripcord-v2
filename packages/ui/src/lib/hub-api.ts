import { apiFetch } from './api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HubResponse {
  id: string;
  name: string;
  ownerUserId: string;
  iconUrl?: string;
  bannerUrl?: string;
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
  pinnedAt?: string | null;
  pinnedBy?: string | null;
  attachments?: Array<{
    id: string;
    fileNameEncrypted: string;
    fileSize: number;
    contentTypeEncrypted?: string | null;
    encryptionKeyId: string;
    nonce: string;
  }>;
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
  attachmentIds?: string[],
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const envelope: Record<string, any> = {
    envelopeVersion: 1,
    channelId,
    senderUserId,
    senderDeviceId,
    sentAt: new Date().toISOString(),
    // TODO: Replace with real E2EE encryption in a future sprint
    ciphertext: btoa(unescape(encodeURIComponent(content))),
    nonce: btoa(String(Date.now())),
    keyId: 'dev-key-placeholder',
  };
  if (attachmentIds && attachmentIds.length > 0) {
    envelope.attachmentIds = attachmentIds;
  }
  const res = await apiFetch('/v1/messages/send', {
    method: 'POST',
    body: JSON.stringify(envelope),
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
// Direct Messages
// ---------------------------------------------------------------------------

export interface DmChannelResponse {
  channelId: string;
  createdAt: string;
  participants: Array<{
    userId: string;
    handle: string;
    avatarUrl: string | null;
  }>;
}

/** Create or get an existing DM channel with another user. */
export async function createDmChannel(targetUserId: string): Promise<{ channelId: string }> {
  const res = await apiFetch<{ channelId: string }>('/v1/dm/channels', {
    method: 'POST',
    body: JSON.stringify({ targetUserId }),
  });
  if (!res.ok || !res.data) throw new Error(res.error ?? 'Failed to create DM channel');
  return res.data;
}

/** Fetch all DM channels for the current user. */
export async function fetchDmChannels(): Promise<DmChannelResponse[]> {
  const res = await apiFetch<DmChannelResponse[]>('/v1/dm/channels');
  if (!res.ok || !res.data) throw new Error(res.error ?? 'Failed to fetch DM channels');
  return res.data;
}

// ---------------------------------------------------------------------------
// Message Pinning
// ---------------------------------------------------------------------------

/** Pin a message in a channel. */
export async function pinMessage(channelId: string, messageId: string): Promise<void> {
  const res = await apiFetch(`/v1/channels/${channelId}/messages/${messageId}/pin`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(res.error ?? 'Failed to pin message');
}

/** Unpin a message in a channel. */
export async function unpinMessage(channelId: string, messageId: string): Promise<void> {
  const res = await apiFetch(`/v1/channels/${channelId}/messages/${messageId}/pin`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(res.error ?? 'Failed to unpin message');
}

/** Fetch all pinned messages in a channel. */
export async function fetchPinnedMessages(channelId: string): Promise<MessageResponse[]> {
  const res = await apiFetch<MessageResponse[]>(`/v1/channels/${channelId}/pins`);
  if (!res.ok || !res.data) throw new Error(res.error ?? 'Failed to fetch pinned messages');
  return res.data;
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

// ---------------------------------------------------------------------------
// Hub Leave
// ---------------------------------------------------------------------------

/** Leave a hub. The hub owner cannot leave. */
export async function leaveHub(hubId: string): Promise<void> {
  const res = await apiFetch(`/v1/hubs/${hubId}/leave`, { method: 'POST' });
  if (!res.ok) throw new Error(res.error ?? 'Failed to leave hub');
}

// ---------------------------------------------------------------------------
// Hub Banner
// ---------------------------------------------------------------------------

/** Upload a hub banner image. */
export async function uploadHubBanner(hubId: string, file: File): Promise<string> {
  const res = await apiFetch<{ bannerUrl: string }>(
    `/v1/hubs/${hubId}/banner`,
    {
      method: 'POST',
      body: file,
      headers: { 'Content-Type': file.type },
    },
  );
  if (!res.ok || !res.data) throw new Error(res.error ?? 'Failed to upload banner');
  return res.data.bannerUrl;
}

/** Remove the hub's banner. */
export async function deleteHubBanner(hubId: string): Promise<void> {
  const res = await apiFetch(`/v1/hubs/${hubId}/banner`, { method: 'DELETE' });
  if (!res.ok) throw new Error(res.error ?? 'Failed to remove banner');
}

/** Get the API proxy URL for a hub's banner. */
export function getHubBannerUrl(hubId: string): string {
  return `/v1/hubs/${hubId}/banner`;
}
