/**
 * @module message-list
 * ORBIT spatial message stream. Scrollable message nodes in a constrained
 * center column, with auto-scroll on new arrivals. Consecutive same-author
 * messages are visually grouped as thread branches with an accent left border.
 */
'use client';

import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { useMessageStore, type Message } from '../../stores/message-store';
import { useAuthStore } from '../../stores/auth-store';
import { MessageItem } from './message-item';
import { EmptyState, RadioWavesIcon } from '../ui/empty-state';

const EMPTY_MESSAGES: Message[] = [];

// Distance from bottom (px) at which we consider the user "at the bottom"
const BOTTOM_THRESHOLD = 80;

// ---------------------------------------------------------------------------
// Virtualization — render-window constants
// ---------------------------------------------------------------------------

/** Max messages to render initially (most recent N). Below this count we render all. */
const INITIAL_RENDER_LIMIT = 150;
/** How many additional messages to show when the user clicks "Load earlier". */
const LOAD_MORE_BATCH = 100;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface MessageListProps {
  channelId: string;
}

// ---------------------------------------------------------------------------
// Helpers — group messages into root + thread branch clusters
// ---------------------------------------------------------------------------

interface MessageGroup {
  root: Message;
  replies: Message[];
}

/**
 * Groups consecutive messages from the same author into clusters.
 * The first message in a cluster is the "root" and subsequent same-author
 * messages are visually threaded as branches beneath it.
 */
function buildMessageGroups(messages: Message[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  let current: MessageGroup | null = null;

  for (const msg of messages) {
    if (current && current.root.authorId === msg.authorId) {
      current.replies.push(msg);
    } else {
      current = { root: msg, replies: [] };
      groups.push(current);
    }
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------

function MessageSkeleton() {
  return (
    <div className="glass-card p-5 mt-3 rounded-2xl animate-pulse">
      <div className="flex gap-4">
        {/* Avatar circle */}
        <div className="shrink-0 w-9 h-9 rounded-full bg-white/5 border border-white/8" />
        {/* Text lines */}
        <div className="flex-1 space-y-2 pt-1">
          <div className="flex items-center gap-3">
            <div className="h-3 w-24 bg-white/5 rounded-xl" />
            <div className="h-2.5 w-10 bg-white/5 rounded-xl" />
          </div>
          <div className="h-3 w-full bg-white/5 rounded-xl" />
          <div className="h-3 w-3/4 bg-white/5 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MessageList({ channelId }: MessageListProps) {
  const messages = useMessageStore((s) => s.messages[channelId] ?? EMPTY_MESSAGES);
  const currentUserId = useAuthStore((s) => s.userId);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevChannelRef = useRef(channelId);
  // Tracks whether we need to scroll to bottom when messages first load
  const pendingScrollRef = useRef(false);

  // Track whether the user has scrolled away from the bottom
  const [showJumpButton, setShowJumpButton] = useState(false);

  // ── Render-window state ──────────────────────────────────────────────
  const [renderLimit, setRenderLimit] = useState(INITIAL_RENDER_LIMIT);

  // Reset the render window whenever the channel changes so we don't carry
  // a large window from a busy channel into a quiet one.
  useEffect(() => {
    setRenderLimit(INITIAL_RENDER_LIMIT);
  }, [channelId]);

  // Only materialise the tail of the messages array to keep the DOM small.
  const visibleMessages = messages.length > renderLimit
    ? messages.slice(-renderLimit)
    : messages;
  const hasOlderMessages = messages.length > renderLimit;

  // True when the channel key exists in the store but has no messages yet,
  // OR when we have never received data for this channel at all (initial mount).
  const isLoading = useMessageStore((s) => !(channelId in s.messages));

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowJumpButton(distanceFromBottom > BOTTOM_THRESHOLD);
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior });
    setShowJumpButton(false);
  }, []);

  // Auto-scroll to bottom on channel switch (instant) or new messages (smooth),
  // but only if the user is already near the bottom.
  useEffect(() => {
    const isChannelSwitch = prevChannelRef.current !== channelId;
    prevChannelRef.current = channelId;

    if (isChannelSwitch) {
      // Mark a pending scroll — the messages might not be in the DOM yet
      // (component shows skeleton while isLoading). The scroll will fire
      // either now (if messages are already available) or when they load.
      pendingScrollRef.current = true;
      setShowJumpButton(false);
    }

    // Consume pending scroll once messages are available and bottomRef exists
    if (pendingScrollRef.current && !isLoading && bottomRef.current) {
      pendingScrollRef.current = false;
      bottomRef.current.scrollIntoView({ behavior: 'instant' });
      setShowJumpButton(false);
      return;
    }

    // For new messages on the current channel, smooth-scroll if already at bottom
    if (!isChannelSwitch && !isLoading) {
      const el = scrollContainerRef.current;
      if (el) {
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        if (distanceFromBottom <= BOTTOM_THRESHOLD) {
          bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
      }
    }
  }, [channelId, messages.length, isLoading]);

  const groups = useMemo(() => buildMessageGroups(visibleMessages), [visibleMessages]);

  // Loading skeleton — shown when the channel has no data yet
  if (isLoading) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto py-4 px-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <MessageSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  // Empty state — channel loaded but no messages yet
  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center">
        <EmptyState
          icon={<RadioWavesIcon />}
          title="First transmission awaits"
          subtitle="Say something to break the silence..."
        />
      </div>
    );
  }

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto"
      >
        <div className="max-w-3xl mx-auto py-4 px-6 space-y-1">
          {/* Load earlier messages — only shown when the render window is truncated */}
          {hasOlderMessages && (
            <div className="flex justify-center">
              <button
                onClick={() => setRenderLimit((prev) => prev + LOAD_MORE_BATCH)}
                className="mx-auto my-3 flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-4 py-2 text-xs text-text-muted hover:text-accent hover:border-accent/30 transition-colors cursor-pointer"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 12V4M4 8l4-4 4 4" />
                </svg>
                Load earlier messages ({messages.length - renderLimit} more)
              </button>
            </div>
          )}
          {groups.map((group) => (
            <div key={group.root.id}>
              {/* Root message — full glass-card node */}
              <MessageItem
                message={group.root}
                isConsecutive={false}
                isOwnMessage={group.root.authorId === currentUserId}
              />

              {/* Thread branch — consecutive same-author replies */}
              {group.replies.length > 0 && (
                <div className="ml-12 pl-6 border-l border-accent/20 space-y-0.5">
                  {group.replies.map((reply) => (
                    <MessageItem
                      key={reply.id}
                      message={reply}
                      isConsecutive={true}
                      isOwnMessage={reply.authorId === currentUserId}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Jump to latest button — shown when scrolled away from bottom */}
      {showJumpButton && (
        <button
          onClick={() => scrollToBottom('smooth')}
          className="fixed bottom-24 right-6 font-mono text-[11px] bg-accent/20 border border-accent/30 text-accent rounded-full px-4 py-2 hover:bg-accent/30 transition-all duration-150 cursor-pointer z-50 flex items-center gap-1.5 shadow-lg shadow-accent/10"
          title="Jump to latest message"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3v10M4 9l4 4 4-4" />
          </svg>
          Jump to latest
        </button>
      )}
    </div>
  );
}
