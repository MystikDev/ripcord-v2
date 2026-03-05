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

const EMPTY_MESSAGES: Message[] = [];

// Distance from bottom (px) at which we consider the user "at the bottom"
const BOTTOM_THRESHOLD = 80;

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

  // Track whether the user has scrolled away from the bottom
  const [showJumpButton, setShowJumpButton] = useState(false);

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
    const el = scrollContainerRef.current;
    const isChannelSwitch = prevChannelRef.current !== channelId;
    prevChannelRef.current = channelId;

    if (isChannelSwitch) {
      // Always jump instantly when switching channels
      bottomRef.current?.scrollIntoView({ behavior: 'instant' });
      setShowJumpButton(false);
    } else if (el) {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distanceFromBottom <= BOTTOM_THRESHOLD) {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [channelId, messages.length]);

  const groups = useMemo(() => buildMessageGroups(messages), [messages]);

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
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 border border-white/10">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-text-muted">
            <path
              d="M8 12h.01M12 12h.01M16 12h.01"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <p className="text-sm text-text-muted">
          No messages yet. Start the conversation!
        </p>
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
