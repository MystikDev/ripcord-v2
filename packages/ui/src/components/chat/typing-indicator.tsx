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
  const pruneExpired = useTypingStore((s) => s.pruneExpired);
  const currentUserId = useAuthStore((s) => s.userId);

  // Select the raw typing array for this channel so the component re-renders
  // when typing data changes. Selecting `getTyping` (a stable function ref)
  // would never trigger re-renders because the reference never changes.
  const rawTyping = useTypingStore((s) => s.typing[channelId]);

  // Prune expired entries every second
  useEffect(() => {
    const interval = setInterval(pruneExpired, 1_000);
    return () => clearInterval(interval);
  }, [pruneExpired]);

  const now = Date.now();
  const typing = (rawTyping ?? []).filter(
    (t) => t.expiresAt > now && t.userId !== currentUserId,
  );

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
