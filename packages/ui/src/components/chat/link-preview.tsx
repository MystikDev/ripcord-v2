/**
 * @module link-preview
 * Discord-style OpenGraph metadata embed shown below messages containing URLs.
 * Fetches metadata client-side to preserve E2E encryption privacy.
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchLinkMetadata, type LinkMetadata } from '../../lib/link-metadata';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface LinkPreviewProps {
  url: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LinkPreview({ url }: LinkPreviewProps) {
  const [meta, setMeta] = useState<LinkMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetchLinkMetadata(url).then((result) => {
      if (cancelled) return;
      if (result) {
        setMeta(result);
      } else {
        setError(true);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [url]);

  const handleClick = useCallback(async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-shell');
      await open(url);
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, [url]);

  // Nothing useful to show
  if (error || (!loading && !meta)) return null;

  // Loading skeleton — Discord-style with left accent border
  if (loading) {
    return (
      <div className="mt-1.5 flex max-w-lg animate-pulse overflow-hidden rounded border-l-4 border-l-accent/40 border border-border bg-surface-1">
        <div className="flex-1 space-y-2 p-3">
          <div className="h-2.5 w-24 rounded bg-surface-2" />
          <div className="h-3 w-3/4 rounded bg-surface-2" />
          <div className="h-2.5 w-full rounded bg-surface-2" />
        </div>
      </div>
    );
  }

  const showImage = meta!.image && !imgFailed;

  return (
    <button
      onClick={handleClick}
      className="mt-1.5 flex max-w-lg overflow-hidden rounded border-l-4 border-l-accent border border-border bg-surface-1 text-left transition-colors hover:bg-surface-2"
    >
      <div className="min-w-0 flex-1 p-3">
        {/* Site name / domain */}
        <p className="text-xs font-medium text-text-muted">
          {meta!.siteName ?? meta!.domain}
        </p>

        {/* Title */}
        {meta!.title && (
          <p className="mt-0.5 text-sm font-semibold text-accent line-clamp-1 leading-snug">
            {meta!.title}
          </p>
        )}

        {/* Description */}
        {meta!.description && (
          <p className="mt-1 text-xs text-text-secondary leading-relaxed line-clamp-3">
            {meta!.description}
          </p>
        )}

        {/* Large image preview below text */}
        {showImage && (
          <img
            src={meta!.image!}
            alt=""
            className="mt-2 w-full max-h-56 rounded object-cover"
            onError={() => setImgFailed(true)}
          />
        )}
      </div>
    </button>
  );
}
