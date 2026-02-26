/**
 * @module file-upload-button
 * Icon button that opens a file picker, encrypts the selected file with
 * {@link encryptFile}, uploads ciphertext to S3/MinIO, and returns attachment
 * metadata. Shows a progress bar during upload. Exposes a ref for paste-to-upload.
 */
'use client';

import { useRef, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import { encryptFile } from '../../lib/file-crypto';
import { requestUpload } from '../../lib/attachment-api';
import { useToast } from '../ui/toast';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

/** Imperative handle exposed to parent via ref. */
export interface FileUploadHandle {
  /** Upload a file programmatically (e.g. from a paste event). */
  uploadFile: (file: File) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const FileUploadButton = forwardRef<FileUploadHandle, FileUploadButtonProps>(
  function FileUploadButton({ channelId, onUploaded, disabled }, ref) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const toast = useToast();

    const doUpload = useCallback(async (file: File) => {
      if (uploading) return;

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

        // Request upload URL from server
        const result = await requestUpload({
          channelId,
          fileNameEncrypted,
          fileSize: encrypted.ciphertext.byteLength,
          contentTypeEncrypted,
          encryptionKeyId: encrypted.keyId,
          nonce: encrypted.nonce,
        });
        setProgress(70);

        // Upload encrypted file to the proxy blob endpoint
        const putRes = await fetch(result.uploadUrl, {
          method: 'PUT',
          body: new Uint8Array(encrypted.ciphertext),
          headers: { 'Content-Type': 'application/octet-stream' },
        });
        if (!putRes.ok) {
          const errText = await putRes.text().catch(() => putRes.statusText);
          throw new Error(`Upload failed (${putRes.status}): ${errText}`);
        }
        setProgress(100);

        onUploaded({
          attachmentId: result.attachmentId,
          fileNameEncrypted,
          fileSize: file.size,
          encryptionKeyId: encrypted.keyId,
          nonce: encrypted.nonce,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown upload error';
        console.error('File upload failed:', msg, err);
        toast.error(`Upload failed: ${msg}`);
      } finally {
        setUploading(false);
        setProgress(0);
        if (inputRef.current) inputRef.current.value = '';
      }
    }, [channelId, onUploaded, uploading, toast]);

    // Expose uploadFile to parent (message composer paste handler)
    useImperativeHandle(ref, () => ({ uploadFile: doUpload }), [doUpload]);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) doUpload(file);
    };

    return (
      <div className="relative self-end">
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
  },
);
