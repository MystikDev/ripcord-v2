'use client';

import { motion } from 'framer-motion';
import { Avatar } from '../ui/avatar';
import { AttachmentPreview } from './attachment-preview';
import { useMemberStore } from '../../stores/member-store';
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
// Component
// ---------------------------------------------------------------------------

export function MessageItem({ message, isConsecutive }: MessageItemProps) {
  // Resolve handle + avatar from member cache (reactive — updates when members load)
  const cachedHandle = useMemberStore((s) => s.members[message.authorId]?.handle);
  const cachedAvatarUrl = useMemberStore((s) => s.members[message.authorId]?.avatarUrl);
  const displayHandle = cachedHandle ?? message.authorHandle;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className={`group flex gap-3 px-4 py-0.5 hover:bg-surface-1/50 ${
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
            <span className="font-medium text-text-primary">
              {displayHandle}
            </span>
            <span className="text-xs text-text-muted">
              {formatTime(message.createdAt)}
            </span>
            {message.editedAt && (
              <span className="text-xs text-text-muted">(edited)</span>
            )}
          </div>
        )}
        <p className="text-sm text-text-secondary leading-relaxed break-words">
          {message.content}
        </p>
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-col gap-1">
            {message.attachments.map((att) => (
              <AttachmentPreview
                key={att.id}
                attachmentId={att.id}
                fileNameEncrypted={att.fileNameEncrypted}
                fileSize={att.fileSize}
                encryptionKeyId={att.encryptionKeyId}
                nonce={att.nonce}
              />
            ))}
          </div>
        )}
      </div>

      {/* Timestamp on hover for consecutive messages */}
      {isConsecutive && (
        <span className="hidden shrink-0 text-xs text-text-muted group-hover:block">
          {formatTime(message.createdAt)}
        </span>
      )}
    </motion.div>
  );
}
