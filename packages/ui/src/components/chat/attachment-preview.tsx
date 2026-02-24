/**
 * @module attachment-preview
 * File attachment display within messages. For images, auto-fetches the
 * encrypted blob, decrypts client-side, and renders an inline preview.
 * For non-image files, shows a download chip with filename and size.
 */
'use client';

import { useState, useEffect, useRef } from 'react';
import { getDownloadUrl } from '../../lib/attachment-api';
import { decryptFile } from '../../lib/file-crypto';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AttachmentPreviewProps {
  attachmentId: string;
  fileNameEncrypted: string;
  fileSize: number;
  contentTypeEncrypted?: string | null;
  encryptionKeyId: string;
  nonce: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

/** Decode the base64-encoded MIME type. Returns null if missing/invalid. */
function decodeMimeType(contentTypeEncrypted?: string | null): string | null {
  if (!contentTypeEncrypted) return null;
  try {
    return atob(contentTypeEncrypted);
  } catch {
    return null;
  }
}

/** Check whether a MIME type is a displayable image format. */
function isDisplayableImage(mimeType: string | null): boolean {
  if (!mimeType) return false;
  return mimeType.startsWith('image/');
}

/** MIME types that represent text/document files. */
const TEXT_DOCUMENT_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/html',
  'text/xml',
  'application/json',
  'application/xml',
  'application/javascript',
  'application/typescript',
]);

/** Check whether a MIME type is a text document format. */
function isTextDocument(mimeType: string | null): boolean {
  if (!mimeType) return false;
  return TEXT_DOCUMENT_TYPES.has(mimeType) || mimeType.startsWith('text/');
}

// ---------------------------------------------------------------------------
// Inline Image Preview
// ---------------------------------------------------------------------------

function ImagePreview({
  attachmentId,
  fileName,
  fileSize,
  mimeType,
  encryptionKeyId,
  nonce,
}: {
  attachmentId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  encryptionKeyId: string;
  nonce: string;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchAndDecrypt() {
      try {
        const { downloadUrl } = await getDownloadUrl(attachmentId);
        const response = await fetch(downloadUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const encryptedData = await response.arrayBuffer();
        const plaintext = await decryptFile(encryptedData, nonce, encryptionKeyId);

        if (cancelled) return;

        const blob = new Blob([plaintext], { type: mimeType });
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        setBlobUrl(url);
      } catch (err) {
        console.error('Image preview failed:', err);
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchAndDecrypt();

    return () => {
      cancelled = true;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [attachmentId, nonce, encryptionKeyId, mimeType]);

  const handleDownload = () => {
    if (!blobUrl) return;
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Error: fall back to download button
  if (error) {
    return (
      <FileDownloadButton
        attachmentId={attachmentId}
        fileName={fileName}
        fileSize={fileSize}
        encryptionKeyId={encryptionKeyId}
        nonce={nonce}
      />
    );
  }

  // Loading skeleton
  if (loading) {
    return (
      <div className="mt-1 flex max-w-md items-center justify-center rounded-lg border border-border bg-surface-1 p-4">
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
          Loading image...
        </div>
      </div>
    );
  }

  // Inline image
  return (
    <div className="mt-1 max-w-md">
      <img
        src={blobUrl!}
        alt={fileName}
        onClick={handleDownload}
        title={`${fileName} (${formatFileSize(fileSize)}) — click to download`}
        className="max-h-80 cursor-pointer rounded-lg border border-border object-contain transition-opacity hover:opacity-90"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// File Download Button (non-image fallback)
// ---------------------------------------------------------------------------

function FileDownloadButton({
  attachmentId,
  fileName,
  fileSize,
  encryptionKeyId,
  nonce,
  isDocument = false,
}: {
  attachmentId: string;
  fileName: string;
  fileSize: number;
  encryptionKeyId: string;
  nonce: string;
  isDocument?: boolean;
}) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const { downloadUrl } = await getDownloadUrl(attachmentId);
      const response = await fetch(downloadUrl);
      const encryptedData = await response.arrayBuffer();
      const plaintext = await decryptFile(encryptedData, nonce, encryptionKeyId);

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
        ) : isDocument ? (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 1h5.5L13 4.5V14a1 1 0 01-1 1H4a1 1 0 01-1-1V2a1 1 0 011-1z" strokeLinejoin="round" />
            <path d="M9 1v4h4M5.5 8h5M5.5 10.5h5M5.5 13h3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
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

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function AttachmentPreview({
  attachmentId,
  fileNameEncrypted,
  fileSize,
  contentTypeEncrypted,
  encryptionKeyId,
  nonce,
}: AttachmentPreviewProps) {
  const fileName = decryptFileName(fileNameEncrypted);
  const mimeType = decodeMimeType(contentTypeEncrypted);

  if (isDisplayableImage(mimeType)) {
    return (
      <ImagePreview
        attachmentId={attachmentId}
        fileName={fileName}
        fileSize={fileSize}
        mimeType={mimeType!}
        encryptionKeyId={encryptionKeyId}
        nonce={nonce}
      />
    );
  }

  return (
    <FileDownloadButton
      attachmentId={attachmentId}
      fileName={fileName}
      fileSize={fileSize}
      encryptionKeyId={encryptionKeyId}
      nonce={nonce}
      isDocument={isTextDocument(mimeType)}
    />
  );
}
