/**
 * @module bookmarks-panel
 * Side panel showing saved message bookmarks. Click to navigate to the
 * bookmarked channel/message. Bookmarks are client-side only (E2EE).
 */
'use client';

import { useCallback } from 'react';
import { useBookmarkStore, type Bookmark } from '../../stores/bookmark-store';
import { useHubStore } from '../../stores/server-store';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface BookmarksPanelProps {
  onClose: () => void;
}

export function BookmarksPanel({ onClose }: BookmarksPanelProps) {
  const bookmarks = useBookmarkStore((s) => s.bookmarks);
  const removeBookmark = useBookmarkStore((s) => s.removeBookmark);
  const setActiveChannel = useHubStore((s) => s.setActiveChannel);
  const setActiveDmChannel = useHubStore((s) => s.setActiveDmChannel);
  const channels = useHubStore((s) => s.channels);
  const dmChannels = useHubStore((s) => s.dmChannels);

  const handleNavigate = useCallback(
    (bookmark: Bookmark) => {
      // Check if it's a hub channel or DM channel
      const isHubChannel = channels.some((c) => c.id === bookmark.channelId);
      const isDmChannel = dmChannels.some((dm) => dm.channelId === bookmark.channelId);

      if (isHubChannel) {
        setActiveChannel(bookmark.channelId);
      } else if (isDmChannel) {
        setActiveDmChannel(bookmark.channelId);
      }
    },
    [channels, dmChannels, setActiveChannel, setActiveDmChannel],
  );

  return (
    <div className="flex w-72 shrink-0 flex-col border-l border-border bg-surface-1">
      {/* Header */}
      <div className="flex h-12 items-center justify-between border-b border-border px-4">
        <h3 className="text-sm font-semibold text-text-primary">Bookmarks</h3>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-text-muted hover:bg-surface-2 hover:text-text-primary transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M1 1l12 12M13 1L1 13" />
          </svg>
        </button>
      </div>

      {/* Bookmark list */}
      <div className="flex-1 overflow-y-auto">
        {bookmarks.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
            <svg width="32" height="32" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-3 text-text-muted">
              <path d="M3 2h10a1 1 0 011 1v12l-6-3-6 3V3a1 1 0 011-1z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="text-sm text-text-muted">No bookmarks yet</p>
            <p className="mt-1 text-xs text-text-muted">
              Right-click a message and select "Bookmark" to save it here
            </p>
          </div>
        ) : (
          bookmarks.map((bm) => (
            <div
              key={bm.messageId}
              className="group border-b border-border/50 px-4 py-3 hover:bg-surface-2 cursor-pointer transition-colors"
              onClick={() => handleNavigate(bm)}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-text-primary truncate">
                  {bm.authorHandle}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeBookmark(bm.messageId);
                  }}
                  className="hidden group-hover:block rounded p-0.5 text-text-muted hover:text-text-primary transition-colors"
                  title="Remove bookmark"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M2 2l8 8M10 2l-8 8" />
                  </svg>
                </button>
              </div>
              <p className="text-xs text-text-secondary line-clamp-2 leading-relaxed">
                {bm.contentPreview}
              </p>
              <p className="mt-1 text-[10px] text-text-muted">
                {formatDate(bm.messageTimestamp)}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
