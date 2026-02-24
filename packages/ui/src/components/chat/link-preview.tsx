/**
 * @module link-preview
 * Inline OpenGraph metadata preview card shown below messages containing URLs.
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

  // Loading skeleton
  if (loading) {
    return (
      <div className="mt-1 flex max-w-md animate-pulse items-center gap-3 rounded-lg border border-border bg-surface-1 p-3">
        <div className="h-12 w-12 shrink-0 rounded bg-surface-2" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-3/4 rounded bg-surface-2" />
          <div className="h-2.5 w-full rounded bg-surface-2" />
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={handleClick}
      className="mt-1 flex max-w-md items-start gap-3 rounded-lg border border-border bg-surface-1 p-3 text-left transition-colors hover:bg-surface-2"
    >
      {/* Thumbnail */}
      {meta!.image && (
        <img
          src={meta!.image}
          alt=""
          className="h-16 w-16 shrink-0 rounded object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      )}

      {/* Text content */}
      <div className="min-w-0 flex-1">
        <p className="text-xs text-text-muted">{meta!.siteName ?? meta!.domain}</p>
        {meta!.title && (
          <p className="truncate text-sm font-medium text-text-primary">{meta!.title}</p>
        )}
        {meta!.description && (
          <p className="line-clamp-2 text-xs text-text-secondary leading-relaxed">
            {meta!.description}
          </p>
        )}
      </div>
    </button>
  );
}
