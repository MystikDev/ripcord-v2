/**
 * @module typing-indicator
 * Renders iMessage-style speech bubbles with pulsing dots for each user
 * currently typing in the channel. Prunes expired entries every second.
 * Uses framer-motion AnimatePresence for smooth enter/exit transitions.
 */
'use client';

import { useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useTypingStore } from '../../stores/typing-store';
import { useAuthStore } from '../../stores/auth-store';
import { TypingBubble } from './typing-bubble';

export function TypingIndicator({ channelId }: { channelId: string }) {
  const getTyping = useTypingStore((s) => s.getTyping);
  const pruneExpired = useTypingStore((s) => s.pruneExpired);
  const currentUserId = useAuthStore((s) => s.userId);

  // Prune expired entries every second
  useEffect(() => {
    const interval = setInterval(pruneExpired, 1_000);
    return () => clearInterval(interval);
  }, [pruneExpired]);

  const typing = getTyping(channelId).filter((t) => t.userId !== currentUserId);

  return (
    <div className="flex min-h-[8px] flex-col gap-1 px-4 py-1">
      <AnimatePresence mode="popLayout">
        {typing.map((t) => (
          <TypingBubble
            key={t.userId}
            userId={t.userId}
            handle={t.handle || t.userId.slice(0, 8)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
