/**
 * @module message-list
 * ORBIT spatial message stream. Scrollable message nodes in a constrained
 * center column, with auto-scroll on new arrivals. Consecutive same-author
 * messages are visually grouped as thread branches with an accent left border.
 */
'use client';

import { useEffect, useRef, useMemo } from 'react';
import { useMessageStore, type Message } from '../../stores/message-store';
import { ScrollArea } from '../ui/scroll-area';
import { MessageItem } from './message-item';

const EMPTY_MESSAGES: Message[] = [];

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
// Component
// ---------------------------------------------------------------------------

export function MessageList({ channelId }: MessageListProps) {
  const messages = useMessageStore((s) => s.messages[channelId] ?? EMPTY_MESSAGES);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevChannelRef = useRef(channelId);

  // Auto-scroll to bottom on channel switch (instant) or new messages (smooth)
  useEffect(() => {
    const isChannelSwitch = prevChannelRef.current !== channelId;
    prevChannelRef.current = channelId;
    bottomRef.current?.scrollIntoView({ behavior: isChannelSwitch ? 'instant' : 'smooth' });
  }, [channelId, messages.length]);

  const groups = useMemo(() => buildMessageGroups(messages), [messages]);

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
    <ScrollArea className="flex-1">
      <div className="max-w-3xl mx-auto py-4 px-6 space-y-1">
        {groups.map((group) => (
          <div key={group.root.id}>
            {/* Root message — full glass-card node */}
            <MessageItem
              message={group.root}
              isConsecutive={false}
            />

            {/* Thread branch — consecutive same-author replies */}
            {group.replies.length > 0 && (
              <div className="ml-12 pl-6 border-l border-accent/20 space-y-0.5">
                {group.replies.map((reply) => (
                  <MessageItem
                    key={reply.id}
                    message={reply}
                    isConsecutive={true}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
