/**
 * @module message-content
 * Renders message text with clickable URLs. URLs open in the default
 * browser via Tauri shell plugin (desktop) or window.open (web).
 */
'use client';

import { useCallback } from 'react';
import { segmentText } from '../../lib/url-utils';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MessageContentProps {
  content: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MessageContent({ content }: MessageContentProps) {
  const segments = segmentText(content);

  const handleLinkClick = useCallback(
    async (e: React.MouseEvent, url: string) => {
      e.preventDefault();
      try {
        const { open } = await import('@tauri-apps/plugin-shell');
        await open(url);
      } catch {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    },
    [],
  );

  // No URLs detected — render plain text (zero overhead)
  if (segments.length === 1 && segments[0].type === 'text') {
    return (
      <p className="text-text-secondary leading-relaxed break-words" style={{ fontSize: 'var(--font-size-base, 14px)' }}>
        {content}
      </p>
    );
  }

  return (
    <p className="text-text-secondary leading-relaxed break-words" style={{ fontSize: 'var(--font-size-base, 14px)' }}>
      {segments.map((seg, i) =>
        seg.type === 'url' ? (
          <a
            key={i}
            href={seg.value}
            onClick={(e) => handleLinkClick(e, seg.value)}
            className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent transition-colors"
            title={seg.value}
          >
            {seg.value}
          </a>
        ) : (
          <span key={i}>{seg.value}</span>
        ),
      )}
    </p>
  );
}
