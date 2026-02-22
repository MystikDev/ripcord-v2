import { apiFetch } from './api';
import { getApiBaseUrl } from './constants';

// ---------------------------------------------------------------------------
// User Avatar
// ---------------------------------------------------------------------------

/**
 * Upload a user avatar image.
 *
 * Sends the file directly to the API server which proxies it to MinIO.
 *
 * @returns The storage key for the uploaded avatar.
 */
export async function uploadUserAvatar(userId: string, file: File): Promise<string> {
  const res = await apiFetch<{ avatarUrl: string }>(
    `/v1/users/${userId}/avatar`,
    {
      method: 'POST',
      body: file,
      headers: { 'Content-Type': file.type },
    },
  );
  if (!res.ok || !res.data) throw new Error(res.error ?? 'Failed to upload avatar');

  return res.data.avatarUrl;
}

/** Remove the user's avatar. */
export async function deleteUserAvatar(userId: string): Promise<void> {
  const res = await apiFetch(`/v1/users/${userId}/avatar`, { method: 'DELETE' });
  if (!res.ok) throw new Error(res.error ?? 'Failed to remove avatar');
}

/** Get the full API proxy URL for a user's avatar. */
export function getUserAvatarUrl(userId: string): string {
  return `${getApiBaseUrl()}/v1/users/${userId}/avatar`;
}
