/**
 * @module message-item
 * Individual message row. Renders avatar (collapsed for consecutive same-author
 * messages), display name, timestamp, text body, file attachments, and pin
 * indicator / action buttons.
 * Uses Framer Motion for slide-in animation.
 */
'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Avatar } from '../ui/avatar';
import { AttachmentPreview } from './attachment-preview';
import { MessageContent } from './message-content';
import { LinkPreview } from './link-preview';
import { extractUrls } from '../../lib/url-utils';
import { useMemberStore } from '../../stores/member-store';
import { useAuthStore } from '../../stores/auth-store';
import { UserContextMenu } from '../ui/user-context-menu';
import { pinMessage, unpinMessage } from '../../lib/hub-api';
import type { Message } from '../../stores/message-store';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface MessageItemProps {
  message: Message;
  isConsecutive: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

/** Small pin icon for the pinned badge. */
function PinIcon({ className }: { className?: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M9.828 1.172a1 1 0 011.414 0l3.586 3.586a1 1 0 010 1.414L12 9l-1 4-4-4-4.5 4.5M7 9L2.172 4.172l2.828-2.829L9.828 6" />
    </svg>
  );
}

/** Larger pin icon for the action button. */
function PinActionIcon({ pinned }: { pinned: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill={pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.828 1.172a1 1 0 011.414 0l3.586 3.586a1 1 0 010 1.414L12 9l-1 4-4-4-4.5 4.5M7 9L2.172 4.172l2.828-2.829L9.828 6" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MessageItem({ message, isConsecutive }: MessageItemProps) {
  // Resolve handle + avatar from member cache (reactive — updates when members load)
  const cachedHandle = useMemberStore((s) => s.members[message.authorId]?.handle);
  const cachedAvatarUrl = useMemberStore((s) => s.members[message.authorId]?.avatarUrl);
  const displayHandle = cachedHandle ?? message.authorHandle;
  const currentUserId = useAuthStore((s) => s.userId);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const isPinned = !!message.pinnedAt;

  const handleTogglePin = useCallback(async () => {
    try {
      if (isPinned) {
        await unpinMessage(message.channelId, message.id);
      } else {
        await pinMessage(message.channelId, message.id);
      }
    } catch (err) {
      console.error('Failed to toggle pin:', err);
    }
  }, [isPinned, message.channelId, message.id]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className={`group relative flex gap-3 px-4 py-0.5 hover:bg-surface-1/50 ${
        isConsecutive ? '' : 'mt-3 pt-1'
      }`}
    >
      {/* Avatar column */}
      <div className="w-10 shrink-0">
        {!isConsecutive && (
          <Avatar
            src={cachedAvatarUrl}
            fallback={displayHandle}
            size="md"
          />
        )}
      </div>

      {/* Content column */}
      <div className="min-w-0 flex-1">
        {!isConsecutive && (
          <div className="flex items-baseline gap-2">
            <span
              className="font-medium text-text-primary cursor-pointer hover:underline"
              onContextMenu={(e) => {
                if (message.authorId === currentUserId) return;
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY });
              }}
            >
              {displayHandle}
            </span>
            <span className="text-xs text-text-muted">
              {formatTime(message.createdAt)}
            </span>
            {message.editedAt && (
              <span className="text-xs text-text-muted">(edited)</span>
            )}
            {isPinned && (
              <span className="flex items-center gap-0.5 text-xs text-accent" title="Pinned message">
                <PinIcon className="text-accent" />
                <span>pinned</span>
              </span>
            )}
          </div>
        )}
        <MessageContent content={message.content} />
        {message.content && extractUrls(message.content).length > 0 && (
          <div className="flex flex-col gap-1">
            {extractUrls(message.content).slice(0, 3).map((url) => (
              <LinkPreview key={url} url={url} />
            ))}
          </div>
        )}
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-col gap-1">
            {message.attachments.map((att) => (
              <AttachmentPreview
                key={att.id}
                attachmentId={att.id}
                fileNameEncrypted={att.fileNameEncrypted}
                fileSize={att.fileSize}
                contentTypeEncrypted={att.contentTypeEncrypted}
                encryptionKeyId={att.encryptionKeyId}
                nonce={att.nonce}
              />
            ))}
          </div>
        )}
      </div>

      {/* Action buttons (show on hover) */}
      <div className="absolute right-2 top-0 hidden items-center gap-0.5 rounded border border-border bg-surface-2 px-0.5 shadow-sm group-hover:flex">
        <button
          onClick={handleTogglePin}
          className={`rounded p-1 transition-colors ${
            isPinned
              ? 'text-accent hover:bg-surface-3'
              : 'text-text-muted hover:bg-surface-3 hover:text-text-primary'
          }`}
          title={isPinned ? 'Unpin message' : 'Pin message'}
        >
          <PinActionIcon pinned={isPinned} />
        </button>
      </div>

      {/* Timestamp on hover for consecutive messages */}
      {isConsecutive && (
        <span className="hidden shrink-0 text-xs text-text-muted group-hover:block">
          {formatTime(message.createdAt)}
        </span>
      )}

      {/* User context menu */}
      {contextMenu && (
        <UserContextMenu
          userId={message.authorId}
          displayName={displayHandle}
          position={contextMenu}
          onClose={() => setContextMenu(null)}
        />
      )}
    </motion.div>
  );
}
