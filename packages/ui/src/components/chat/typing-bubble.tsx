'use client';

/**
 * @module typing-bubble
 * iMessage-style speech bubble with three pulsing dots, shown for a single
 * typing user. Wrapped in framer-motion for smooth enter/exit animations.
 * Intended to be rendered inside an AnimatePresence parent.
 */

import { motion } from 'framer-motion';
import { Avatar } from '../ui/avatar';
import { useMemberStore } from '../../stores/member-store';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TypingBubbleProps {
  userId: string;
  handle: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TypingBubble({ userId, handle }: TypingBubbleProps) {
  const avatarUrl = useMemberStore((s) => s.members[userId]?.avatarUrl);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.95 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      layout
      className="flex items-end gap-2"
    >
      {/* User avatar */}
      <Avatar src={avatarUrl ?? undefined} fallback={handle} size="sm" />

      {/* Handle + speech bubble */}
      <div>
        <span className="mb-0.5 block text-xs text-text-muted">{handle}</span>
        <div className="inline-flex items-center gap-1.5 rounded-2xl rounded-bl-sm bg-surface-2 px-4 py-3">
          <span
            className="inline-block h-2 w-2 rounded-full bg-text-muted"
            style={{ animation: 'typing-dot 1.4s infinite', animationDelay: '0ms' }}
          />
          <span
            className="inline-block h-2 w-2 rounded-full bg-text-muted"
            style={{ animation: 'typing-dot 1.4s infinite', animationDelay: '160ms' }}
          />
          <span
            className="inline-block h-2 w-2 rounded-full bg-text-muted"
            style={{ animation: 'typing-dot 1.4s infinite', animationDelay: '320ms' }}
          />
        </div>
      </div>
    </motion.div>
  );
}
