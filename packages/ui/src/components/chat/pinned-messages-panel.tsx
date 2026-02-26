/**
 * @module pinned-messages-panel
 * Slide-out panel that displays pinned messages for the active channel.
 * Fetches pinned messages on open, decrypts content, and renders them
 * with unpin action buttons.
 */
'use client';

import { useEffect, useState, useCallback } from 'react';
import { fetchPinnedMessages, unpinMessage } from '../../lib/hub-api';
import { useMemberStore } from '../../stores/member-store';
import type { MessageResponse } from '../../lib/hub-api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PinnedMessage {
  id: string;
  channelId: string;
  authorId: string;
  authorHandle: string;
  content: string;
  createdAt: string;
  pinnedAt: string | null;
}

interface PinnedMessagesPanelProps {
  channelId: string;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function decryptContent(msg: MessageResponse): string {
  try {
    return decodeURIComponent(escape(atob(msg.envelope.ciphertext)));
  } catch {
    return '[encrypted message]';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PinnedMessagesPanel({ channelId, onClose }: PinnedMessagesPanelProps) {
  const [pinned, setPinned] = useState<PinnedMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPinned = useCallback(async () => {
    setLoading(true);
    try {
      const msgs = await fetchPinnedMessages(channelId);
      const memberState = useMemberStore.getState();
      setPinned(
        msgs.map((m) => ({
          id: m.id,
          channelId: m.channelId,
          authorId: m.senderUserId,
          authorHandle:
            memberState.getHandle(m.senderUserId) ?? m.senderUserId.slice(0, 8),
          content: decryptContent(m),
          createdAt: m.createdAt,
          pinnedAt: m.pinnedAt ?? null,
        })),
      );
    } catch (err) {
      console.error('Failed to load pinned messages:', err);
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    void loadPinned();
  }, [loadPinned]);

  const handleUnpin = useCallback(
    async (messageId: string) => {
      try {
        await unpinMessage(channelId, messageId);
        setPinned((prev) => prev.filter((m) => m.id !== messageId));
      } catch (err) {
        console.error('Failed to unpin message:', err);
      }
    },
    [channelId],
  );

  return (
    <div className="flex h-full w-72 flex-col border-l border-border bg-surface-1">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-text-primary">Pinned Messages</h3>
        <button
          onClick={onClose}
          className="rounded p-1 text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary"
          title="Close"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <span className="text-sm text-text-muted">Loading...</span>
          </div>
        )}

        {!loading && pinned.length === 0 && (
          <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
            <svg width="32" height="32" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-3 text-text-muted">
              <path d="M9.828 1.172a1 1 0 011.414 0l3.586 3.586a1 1 0 010 1.414L12 9l-1 4-4-4-4.5 4.5M7 9L2.172 4.172l2.828-2.829L9.828 6" />
            </svg>
            <p className="text-sm text-text-muted">No pinned messages yet</p>
            <p className="mt-1 text-xs text-text-muted">
              Hover over a message and click the pin icon to pin it
            </p>
          </div>
        )}

        {!loading &&
          pinned.map((msg) => (
            <div
              key={msg.id}
              className="border-b border-border px-4 py-3 transition-colors hover:bg-surface-2/50"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-text-primary">
                    {msg.authorHandle}
                  </span>
                  <span className="text-xs text-text-muted">
                    {formatDate(msg.createdAt)}
                  </span>
                </div>
                <button
                  onClick={() => void handleUnpin(msg.id)}
                  className="rounded p-0.5 text-text-muted transition-colors hover:bg-surface-3 hover:text-text-primary"
                  title="Unpin message"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M4 4l8 8M12 4l-8 8" />
                  </svg>
                </button>
              </div>
              <p className="mt-1 text-sm text-text-secondary line-clamp-3">
                {msg.content}
              </p>
            </div>
          ))}
      </div>
    </div>
  );
}
