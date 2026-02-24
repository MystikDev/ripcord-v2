/**
 * @module typing-indicator
 * Fixed-height bar showing who is currently typing. Prunes expired entries
 * every second, formats text for 1/2/3+ typists, and reserves layout space
 * when empty to prevent content shift.
 */
'use client';

import { useEffect } from 'react';
import { useTypingStore } from '../../stores/typing-store';

export function TypingIndicator({ channelId }: { channelId: string }) {
  const getTyping = useTypingStore((s) => s.getTyping);
  const pruneExpired = useTypingStore((s) => s.pruneExpired);

  // Prune expired entries every second
  useEffect(() => {
    const interval = setInterval(pruneExpired, 1_000);
    return () => clearInterval(interval);
  }, [pruneExpired]);

  const typing = getTyping(channelId);

  if (typing.length === 0) {
    // Reserve space so layout doesn't jump
    return <div className="h-6 px-4" />;
  }

  const names = typing.map((t) => t.handle || t.userId.slice(0, 8));
  let text: string;
  if (names.length === 1) {
    text = `${names[0]} is typing`;
  } else if (names.length === 2) {
    text = `${names[0]} and ${names[1]} are typing`;
  } else {
    text = `${names[0]} and ${names.length - 1} others are typing`;
  }

  return (
    <div className="flex h-6 items-center gap-2 px-4 text-xs text-text-muted">
      {/* Animated dots */}
      <span className="flex gap-0.5">
        <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-text-muted [animation-delay:0ms]" />
        <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-text-muted [animation-delay:150ms]" />
        <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-text-muted [animation-delay:300ms]" />
      </span>
      <span>{text}</span>
    </div>
  );
}
