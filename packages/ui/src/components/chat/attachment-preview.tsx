'use client';

import { useState } from 'react';
import { getDownloadUrl } from '../../lib/attachment-api';
import { decryptFile } from '../../lib/file-crypto';

interface AttachmentPreviewProps {
  attachmentId: string;
  fileNameEncrypted: string;
  fileSize: number;
  encryptionKeyId: string;
  nonce: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function decryptFileName(encrypted: string): string {
  try {
    return decodeURIComponent(escape(atob(encrypted)));
  } catch {
    return 'Encrypted file';
  }
}

export function AttachmentPreview({
  attachmentId,
  fileNameEncrypted,
  fileSize,
  encryptionKeyId,
  nonce,
}: AttachmentPreviewProps) {
  const [downloading, setDownloading] = useState(false);
  const fileName = decryptFileName(fileNameEncrypted);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      // Get pre-signed download URL
      const { downloadUrl } = await getDownloadUrl(attachmentId);

      // Download encrypted file
      const response = await fetch(downloadUrl);
      const encryptedData = await response.arrayBuffer();

      // Decrypt
      const plaintext = await decryptFile(encryptedData, nonce, encryptionKeyId);

      // Trigger browser download
      const blob = new Blob([plaintext]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <button
      onClick={handleDownload}
      disabled={downloading}
      className="mt-1 flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2 text-left transition-colors hover:bg-surface-2 disabled:opacity-60"
    >
      <div className="flex h-8 w-8 items-center justify-center rounded bg-accent/10 text-accent">
        {downloading ? (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 10v2.5A1.5 1.5 0 003.5 14h9a1.5 1.5 0 001.5-1.5V10M5 7l3 3 3-3M8 10V2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-primary">{fileName}</p>
        <p className="text-xs text-text-muted">{formatFileSize(fileSize)}</p>
      </div>
    </button>
  );
}
