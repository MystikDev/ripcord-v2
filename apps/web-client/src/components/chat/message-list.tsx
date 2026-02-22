'use client';

import { useEffect, useRef } from 'react';
import { useMessageStore, type Message } from '@/stores/message-store';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageItem } from './message-item';

const EMPTY_MESSAGES: Message[] = [];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface MessageListProps {
  channelId: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MessageList({ channelId }: MessageListProps) {
  const messages = useMessageStore((s) => s.messages[channelId] ?? EMPTY_MESSAGES);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-2">
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
      <div className="py-4">
        {messages.map((msg, i) => {
          const prev = i > 0 ? messages[i - 1] : null;
          const isConsecutive = prev !== null && prev.authorId === msg.authorId;

          return (
            <MessageItem
              key={msg.id}
              message={msg}
              isConsecutive={isConsecutive}
            />
          );
        })}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
