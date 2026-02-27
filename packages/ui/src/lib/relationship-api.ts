/**
 * @module relationship-api
 * Client API functions for the friends/block system.
 */

import { apiFetch } from './api';
import { getUserAvatarUrl } from './user-api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FriendResponse {
  userId: string;
  handle: string;
  avatarUrl: string | null;
  createdAt: string;
}

export interface PendingResponse {
  incoming: FriendResponse[];
  outgoing: FriendResponse[];
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Fetch all accepted friends. */
export async function fetchFriends(): Promise<FriendResponse[]> {
  const res = await apiFetch<FriendResponse[]>('/v1/relationships/friends');
  if (!res.ok || !res.data) return [];
  // Map avatar URLs to full CDN paths
  return res.data.map((f) => ({
    ...f,
    avatarUrl: f.avatarUrl ? getUserAvatarUrl(f.userId) : null,
  }));
}

/** Fetch incoming and outgoing pending friend requests. */
export async function fetchPendingRequests(): Promise<PendingResponse> {
  const res = await apiFetch<PendingResponse>('/v1/relationships/pending');
  if (!res.ok || !res.data) return { incoming: [], outgoing: [] };
  return {
    incoming: res.data.incoming.map((f) => ({
      ...f,
      avatarUrl: f.avatarUrl ? getUserAvatarUrl(f.userId) : null,
    })),
    outgoing: res.data.outgoing.map((f) => ({
      ...f,
      avatarUrl: f.avatarUrl ? getUserAvatarUrl(f.userId) : null,
    })),
  };
}

/** Fetch blocked users. */
export async function fetchBlockedUsers(): Promise<FriendResponse[]> {
  const res = await apiFetch<FriendResponse[]>('/v1/relationships/blocked');
  if (!res.ok || !res.data) return [];
  return res.data;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Send a friend request to a user. */
export async function sendFriendRequest(targetUserId: string): Promise<{ ok: boolean; error?: string }> {
  const res = await apiFetch('/v1/relationships/request', {
    method: 'POST',
    body: JSON.stringify({ targetUserId }),
  });
  return { ok: res.ok, error: res.error };
}

/** Accept an incoming friend request. */
export async function acceptFriendRequest(userId: string): Promise<{ ok: boolean; error?: string }> {
  const res = await apiFetch('/v1/relationships/accept', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
  return { ok: res.ok, error: res.error };
}

/** Decline an incoming friend request. */
export async function declineFriendRequest(userId: string): Promise<{ ok: boolean; error?: string }> {
  const res = await apiFetch('/v1/relationships/decline', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
  return { ok: res.ok, error: res.error };
}

/** Remove a friend. */
export async function removeFriend(userId: string): Promise<{ ok: boolean; error?: string }> {
  const res = await apiFetch(`/v1/relationships/friends/${userId}`, {
    method: 'DELETE',
  });
  return { ok: res.ok, error: res.error };
}

/** Block a user. */
export async function blockUser(targetUserId: string): Promise<{ ok: boolean; error?: string }> {
  const res = await apiFetch('/v1/relationships/block', {
    method: 'POST',
    body: JSON.stringify({ targetUserId }),
  });
  return { ok: res.ok, error: res.error };
}

/** Unblock a user. */
export async function unblockUser(userId: string): Promise<{ ok: boolean; error?: string }> {
  const res = await apiFetch(`/v1/relationships/block/${userId}`, {
    method: 'DELETE',
  });
  return { ok: res.ok, error: res.error };
}
