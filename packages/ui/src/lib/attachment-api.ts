import { apiFetch } from './api';
import { getApiBaseUrl } from './constants';

export interface UploadRequest {
  channelId: string;
  messageId: string;
  fileNameEncrypted: string;
  fileSize: number;
  contentTypeEncrypted?: string;
  encryptionKeyId: string;
  nonce: string;
}

export interface UploadResponse {
  attachmentId: string;
  uploadUrl: string;
  storageKey: string;
}

export interface DownloadResponse {
  downloadUrl: string;
  attachment: {
    id: string;
    fileNameEncrypted: string;
    fileSize: number;
    contentTypeEncrypted: string | null;
    encryptionKeyId: string;
    nonce: string;
  };
}

/** Request an upload URL for an encrypted file. */
export async function requestUpload(params: UploadRequest): Promise<UploadResponse> {
  const res = await apiFetch<{ ok: boolean; data: UploadResponse }>(
    `/v1/channels/${params.channelId}/attachments/upload`,
    {
      method: 'POST',
      body: JSON.stringify({
        messageId: params.messageId,
        fileNameEncrypted: params.fileNameEncrypted,
        fileSize: params.fileSize,
        contentTypeEncrypted: params.contentTypeEncrypted,
        encryptionKeyId: params.encryptionKeyId,
        nonce: params.nonce,
      }),
    },
  );
  if (!res.ok || !res.data) throw new Error(res.error ?? 'Failed to request upload');
  const payload = res.data as unknown as { ok?: boolean; data?: UploadResponse };
  const result = payload.data ?? (res.data as unknown as UploadResponse);

  // Server returns relative URLs for proxied uploads — make them absolute
  if (result.uploadUrl.startsWith('/')) {
    result.uploadUrl = getApiBaseUrl() + result.uploadUrl;
  }

  return result;
}

/** Get a download URL for an attachment. */
export async function getDownloadUrl(attachmentId: string): Promise<DownloadResponse> {
  const res = await apiFetch<{ ok: boolean; data: DownloadResponse }>(
    `/v1/attachments/${attachmentId}/download`,
  );
  if (!res.ok || !res.data) throw new Error(res.error ?? 'Failed to get download URL');
  const payload = res.data as unknown as { ok?: boolean; data?: DownloadResponse };
  const result = payload.data ?? (res.data as unknown as DownloadResponse);

  // Server returns relative URLs for proxied downloads — make them absolute
  if (result.downloadUrl.startsWith('/')) {
    result.downloadUrl = getApiBaseUrl() + result.downloadUrl;
  }

  return result;
}
