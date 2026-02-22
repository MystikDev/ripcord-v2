/**
 * Stored attachment metadata (returned from API).
 */
export interface Attachment {
  id: string;
  messageId: string;
  channelId: string;
  uploaderUserId: string;
  fileNameEncrypted: string;
  fileSize: number;
  contentTypeEncrypted: string | null;
  storageKey: string;
  encryptionKeyId: string;
  nonce: string;
  createdAt: string;
}

/**
 * Response from requesting a pre-signed upload URL.
 */
export interface PresignedUploadResponse {
  /** The attachment ID (pre-created). */
  attachmentId: string;
  /** S3 pre-signed PUT URL to upload the encrypted file. */
  uploadUrl: string;
  /** The storage key used. */
  storageKey: string;
}

/**
 * Response from requesting a pre-signed download URL.
 */
export interface PresignedDownloadResponse {
  /** S3 pre-signed GET URL to download the encrypted file. */
  downloadUrl: string;
  /** Stored metadata needed for decryption. */
  attachment: Attachment;
}
