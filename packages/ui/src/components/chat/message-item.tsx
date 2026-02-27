/**
 * @module message-item
 * ORBIT-styled message node. Glass-card with gradient border hover effect,
 * avatar with accent ring, display-text author name, and spatial layout.
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
import { useHubStore } from '../../stores/server-store';
import { useAuthStore } from '../../stores/auth-store';
import { useSettingsStore } from '../../stores/settings-store';
import { useBookmarkStore } from '../../stores/bookmark-store';
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

function formatRelativeTime(iso: string): string {
  try {
    const now = Date.now();
    const then = new Date(iso).getTime();
    const diffSec = Math.floor((now - then) / 1000);
    if (diffSec < 0) return 'T-0s';
    if (diffSec < 60) return `T-${diffSec}s`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `T-${diffMin}m`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `T-${diffHr}H`;
    return `T-${Math.floor(diffHr / 24)}D`;
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

/** Bookmark icon for the action button. */
function BookmarkIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 2h10a1 1 0 011 1v12l-6-3-6 3V3a1 1 0 011-1z" />
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
  // Fallback to DM participant handle when the author isn't in the hub member cache
  const dmHandle = useHubStore((s) => {
    const dm = s.dmChannels.find((d) => d.channelId === message.channelId);
    return dm?.participants.find((p) => p.userId === message.authorId)?.handle;
  });
  const displayHandle = cachedHandle ?? dmHandle ?? message.authorHandle;
  const currentUserId = useAuthStore((s) => s.userId);
  const compactMode = useSettingsStore((s) => s.compactMode);
  const isBookmarked = useBookmarkStore((s) => s.isBookmarked(message.id));
  const addBookmark = useBookmarkStore((s) => s.addBookmark);
  const removeBookmark = useBookmarkStore((s) => s.removeBookmark);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const isPinned = !!message.pinnedAt;

  const handleToggleBookmark = useCallback(() => {
    if (isBookmarked) {
      removeBookmark(message.id);
    } else {
      addBookmark({
        messageId: message.id,
        channelId: message.channelId,
        authorHandle: displayHandle,
        contentPreview: message.content.slice(0, 200),
        messageTimestamp: message.createdAt,
      });
    }
  }, [isBookmarked, addBookmark, removeBookmark, message, displayHandle]);

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

  // ---- Compact mode: single-line layout, no avatar ----
  if (compactMode) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
        className="group relative flex items-start gap-2 px-4 py-px hover:bg-white/[0.03] rounded-lg"
      >
        <span className="shrink-0 text-text-muted font-mono" style={{ fontSize: 'var(--font-size-xs, 10px)', minWidth: '3.5em', textAlign: 'right' }}>
          {formatRelativeTime(message.createdAt)}
        </span>
        <div className="min-w-0 flex-1">
          <span className="inline">
            <span
              className="font-medium display-text cursor-pointer hover:underline mr-1.5"
              style={{ fontSize: 'var(--font-size-base, 14px)', color: 'var(--color-username, var(--color-text-primary))' }}
              onContextMenu={(e) => {
                if (message.authorId === currentUserId) return;
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY });
              }}
            >
              {displayHandle}
            </span>
            {isPinned && (
              <span className="inline-flex items-center gap-0.5 text-xs text-accent mr-1.5" title="Pinned message">
                <PinIcon className="text-accent" />
              </span>
            )}
          </span>
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

        {/* Action buttons (show on hover) — glass style */}
        <div className="absolute right-2 top-0 hidden items-center gap-0.5 rounded-xl glass-panel px-1 group-hover:flex">
          <button
            onClick={handleToggleBookmark}
            className={`rounded-lg p-1 transition-colors ${
              isBookmarked
                ? 'text-accent hover:bg-white/10'
                : 'text-text-muted hover:bg-white/10 hover:text-text-primary'
            }`}
            title={isBookmarked ? 'Remove bookmark' : 'Bookmark message'}
          >
            <BookmarkIcon active={isBookmarked} />
          </button>
          <button
            onClick={handleTogglePin}
            className={`rounded-lg p-1 transition-colors ${
              isPinned
                ? 'text-accent hover:bg-white/10'
                : 'text-text-muted hover:bg-white/10 hover:text-text-primary'
            }`}
            title={isPinned ? 'Unpin message' : 'Pin message'}
          >
            <PinActionIcon pinned={isPinned} />
          </button>
        </div>

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

  // ---- Normal mode: ORBIT glass-card node ----
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className={`message-node group relative rounded-2xl transition-colors ${
        isConsecutive ? 'pl-16 py-0.5' : 'glass-card p-5 mt-3'
      }`}
    >
      {/* Avatar + content */}
      <div className={isConsecutive ? '' : 'flex gap-4'}>
        {/* Avatar column */}
        {!isConsecutive && (
          <div className="relative shrink-0">
            <div className="rounded-full border-2 border-accent/30 p-[1px]">
              <Avatar
                src={cachedAvatarUrl}
                fallback={displayHandle}
                size="md"
                style={{ width: 'var(--icon-size-base, 32px)', height: 'var(--icon-size-base, 32px)', fontSize: 'calc(var(--icon-size-base, 32px) * 0.35)' }}
              />
            </div>
            {/* Online dot */}
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-accent rounded-full border-2 border-void" />
          </div>
        )}

        {/* Content column */}
        <div className="min-w-0 flex-1">
          {!isConsecutive && (
            <div className="flex items-center gap-3 mb-1.5">
              <span
                className="display-text font-semibold cursor-pointer hover:underline"
                style={{ fontSize: 'var(--font-size-base, 14px)', color: 'var(--color-username, var(--color-text-primary))' }}
                onContextMenu={(e) => {
                  if (message.authorId === currentUserId) return;
                  e.preventDefault();
                  setContextMenu({ x: e.clientX, y: e.clientY });
                }}
              >
                {displayHandle}
              </span>
              <span className="text-xs text-white/40 font-mono">
                {formatRelativeTime(message.createdAt)}
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
          <div className="text-white/80">
            <MessageContent content={message.content} />
          </div>
          {message.content && extractUrls(message.content).length > 0 && (
            <div className="flex flex-col gap-1 mt-2">
              {extractUrls(message.content).slice(0, 3).map((url) => (
                <LinkPreview key={url} url={url} />
              ))}
            </div>
          )}
          {message.attachments && message.attachments.length > 0 && (
            <div className="flex flex-col gap-1 mt-2">
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

          {/* Thread interaction strip — ORBIT branch + reaction indicators */}
          {!isConsecutive && (
            <div className="mt-3 flex items-center gap-4">
              <button className="flex items-center gap-1.5 text-sm text-white/40 hover:text-accent transition-colors">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 3v10M6 13l-4-4M6 13l4-4" />
                  <path d="M10 3h3v3" />
                  <path d="M13 3L6 10" />
                </svg>
                <span>Thread</span>
              </button>
              <button className="flex items-center gap-1.5 text-sm text-white/40 hover:text-accent-magenta transition-colors">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 14s-5.5-3.5-5.5-7.5C2.5 4 4.5 2 7 2a3.5 3.5 0 011 .5A3.5 3.5 0 019 2c2.5 0 4.5 2 4.5 4.5S8 14 8 14z" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Action buttons (show on hover) — glass overlay */}
      <div className="absolute right-3 top-3 hidden items-center gap-0.5 rounded-xl glass-panel px-1 group-hover:flex">
        <button
          onClick={handleToggleBookmark}
          className={`rounded-lg p-1.5 transition-colors ${
            isBookmarked
              ? 'text-accent hover:bg-white/10'
              : 'text-text-muted hover:bg-white/10 hover:text-text-primary'
          }`}
          title={isBookmarked ? 'Remove bookmark' : 'Bookmark message'}
        >
          <BookmarkIcon active={isBookmarked} />
        </button>
        <button
          onClick={handleTogglePin}
          className={`rounded-lg p-1.5 transition-colors ${
            isPinned
              ? 'text-accent hover:bg-white/10'
              : 'text-text-muted hover:bg-white/10 hover:text-text-primary'
          }`}
          title={isPinned ? 'Unpin message' : 'Pin message'}
        >
          <PinActionIcon pinned={isPinned} />
        </button>
      </div>

      {/* Timestamp on hover for consecutive messages */}
      {isConsecutive && (
        <span className="absolute left-4 top-1/2 -translate-y-1/2 hidden text-xs text-white/30 font-mono group-hover:block">
          {formatRelativeTime(message.createdAt)}
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
