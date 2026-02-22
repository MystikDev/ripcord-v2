'use client';

import { useRef, useState } from 'react';
import { encryptFile } from '../../lib/file-crypto';
import { requestUpload } from '../../lib/attachment-api';

interface FileUploadButtonProps {
  channelId: string;
  /** Called with the attachment metadata after successful upload. */
  onUploaded: (attachment: {
    attachmentId: string;
    fileNameEncrypted: string;
    fileSize: number;
    encryptionKeyId: string;
    nonce: string;
  }) => void;
  disabled?: boolean;
}

export function FileUploadButton({ channelId, onUploaded, disabled }: FileUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setProgress(0);

    try {
      // Read file
      const data = await file.arrayBuffer();
      setProgress(20);

      // Encrypt
      const encrypted = await encryptFile(data);
      setProgress(50);

      // Encrypt filename
      const fileNameEncrypted = btoa(unescape(encodeURIComponent(file.name)));
      const contentTypeEncrypted = file.type ? btoa(file.type) : undefined;

      // Request pre-signed URL (creates a placeholder message ID for now)
      const messageId = `msg-${Date.now()}`; // Placeholder — real flow would create message first
      const result = await requestUpload({
        channelId,
        messageId,
        fileNameEncrypted,
        fileSize: encrypted.ciphertext.byteLength,
        contentTypeEncrypted,
        encryptionKeyId: encrypted.keyId,
        nonce: encrypted.nonce,
      });
      setProgress(70);

      // Upload encrypted file directly to S3/MinIO
      await fetch(result.uploadUrl, {
        method: 'PUT',
        body: encrypted.ciphertext,
        headers: { 'Content-Type': 'application/octet-stream' },
      });
      setProgress(100);

      onUploaded({
        attachmentId: result.attachmentId,
        fileNameEncrypted,
        fileSize: file.size,
        encryptionKeyId: encrypted.keyId,
        nonce: encrypted.nonce,
      });
    } catch (err) {
      console.error('File upload failed:', err);
    } finally {
      setUploading(false);
      setProgress(0);
      // Reset input so same file can be re-selected
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="file"
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled || uploading}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || uploading}
        className="flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
        title="Attach file"
      >
        {uploading ? (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-text-muted border-t-accent" />
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M14 10v2.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 12.5V10M11 5l-3-3-3 3M8 2v8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      {uploading && progress > 0 && (
        <div className="absolute -bottom-1 left-0 h-0.5 w-8 rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-accent transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}
