/**
 * @module channel-sidebar
 * Second-column sidebar for the active hub. Displays the hub name header with
 * admin gear, text/voice channel lists with create buttons, VoiceChannelItem
 * tiles with participant status, VoicePanel for connected sessions, and
 * UserPanel at the bottom.
 */
'use client';

import { useHubStore, type Channel } from '../../stores/server-store';
import { useAuthStore } from '../../stores/auth-store';
import { useReadStateStore } from '../../stores/read-state-store';
import { useMessageStore } from '../../stores/message-store';
import { ScrollArea } from '../ui/scroll-area';
import { Separator } from '../ui/separator';
import { Avatar } from '../ui/avatar';
import clsx from 'clsx';
import { usePresenceStore } from '../../stores/presence-store';
import { useVoiceStateStore, EMPTY_PARTICIPANTS } from '../../stores/voice-state-store';
import { useMemberStore } from '../../stores/member-store';
import { VoicePanel } from '../voice/voice-panel';
import { ParticipantContextMenu } from '../voice/participant-context-menu';
import { CreateChannelDialog } from '../hub/create-channel-dialog';
import { AdminConsole } from '../admin/admin-console';
import { IconCropDialog } from '../admin/icon-crop-dialog';
import { uploadUserAvatar, getUserAvatarUrl } from '../../lib/user-api';
import { useCallback, useRef, useState } from 'react';
import { useToast } from '../ui/toast';
import { getAppVersion } from '../../lib/constants';

const EMPTY_MESSAGES: never[] = [];

// ---------------------------------------------------------------------------
// Channel Item
// ---------------------------------------------------------------------------

function ChannelItem({ channel, isActive }: { channel: Channel; isActive: boolean }) {
  const setActiveChannel = useHubStore((s) => s.setActiveChannel);
  const lastReadId = useReadStateStore((s) => s.readStates[channel.id]?.lastReadMessageId);
  const messages = useMessageStore((s) => s.messages[channel.id] ?? EMPTY_MESSAGES);

  // Compute unread count: messages after the last read message
  let unreadCount = 0;
  if (lastReadId && messages.length > 0) {
    const lastReadIdx = messages.findIndex((m) => m.id === lastReadId);
    if (lastReadIdx >= 0) {
      unreadCount = messages.length - lastReadIdx - 1;
    } else {
      // If we haven't found the read marker, all messages are unread
      unreadCount = messages.length;
    }
  } else if (!lastReadId && messages.length > 0) {
    unreadCount = messages.length;
  }

  const icon = channel.type === 'voice' ? (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <rect x="5.5" y="1" width="5" height="8" rx="2.5" />
      <path d="M3 7.5a5 5 0 0 0 10 0" />
      <path d="M8 12v2.5" />
      <path d="M5.5 14.5h5" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="shrink-0">
      <path d="M2.5 3.5A1.5 1.5 0 014 2h8a1.5 1.5 0 011.5 1.5v7A1.5 1.5 0 0112 12H5.5L2.5 14.5v-11z" />
    </svg>
  );

  return (
    <button
      onClick={() => setActiveChannel(channel.id)}
      className={clsx(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
        isActive
          ? 'bg-surface-3 text-text-primary'
          : 'text-text-muted hover:bg-surface-2 hover:text-text-secondary',
      )}
    >
      {icon}
      <span className="truncate">{channel.name}</span>
      {unreadCount > 0 && !isActive && (
        <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[10px] font-bold text-white">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Voice Channel Item (with participant list)
// ---------------------------------------------------------------------------

function VoiceChannelItem({ channel, isActive }: { channel: Channel; isActive: boolean }) {
  const setActiveChannel = useHubStore((s) => s.setActiveChannel);
  const setPendingVoiceJoin = useHubStore((s) => s.setPendingVoiceJoin);
  const participants = useVoiceStateStore((s) => s.voiceStates[channel.id] ?? EMPTY_PARTICIPANTS);
  const speakingUserIds = useVoiceStateStore((s) => s.speakingUserIds);
  const screenSharingUserIds = useVoiceStateStore((s) => s.screenSharingUserIds);
  const members = useMemberStore((s) => s.members);
  const currentUserId = useAuthStore((s) => s.userId);

  const [contextMenu, setContextMenu] = useState<{
    userId: string;
    handle: string;
    x: number;
    y: number;
  } | null>(null);

  return (
    <div>
      <button
        onClick={() => setActiveChannel(channel.id)}
        onDoubleClick={() => setPendingVoiceJoin(channel.id)}
        className={clsx(
          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
          isActive
            ? 'bg-surface-3 text-text-primary'
            : 'text-text-muted hover:bg-surface-2 hover:text-text-secondary',
        )}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
          <rect x="5.5" y="1" width="5" height="8" rx="2.5" />
          <path d="M3 7.5a5 5 0 0 0 10 0" />
          <path d="M8 12v2.5" />
          <path d="M5.5 14.5h5" />
        </svg>
        <span className="truncate">{channel.name}</span>
        {participants.length > 0 && (
          <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-surface-3 px-1.5 text-[10px] font-medium text-text-muted">
            {participants.length}
          </span>
        )}
      </button>

      {/* Participant list */}
      {participants.length > 0 && (
        <div className="ml-4 border-l border-border/50 pl-3 py-0.5">
          {participants.map((p) => {
            const isSpeaking = speakingUserIds.includes(p.userId);
            const isScreenSharing = screenSharingUserIds.includes(p.userId);
            return (
            <div
              key={p.userId}
              className="flex items-center gap-2 py-0.5 text-xs text-text-muted select-none cursor-default"
              onContextMenu={(e) => {
                if (p.userId === currentUserId) return;
                e.preventDefault();
                setContextMenu({
                  userId: p.userId,
                  handle: p.handle ?? p.userId.slice(0, 8),
                  x: e.clientX,
                  y: e.clientY,
                });
              }}
            >
              <div
                className={clsx(
                  'inline-flex items-center justify-center shrink-0 h-5 w-5 rounded-full transition-shadow',
                  isSpeaking ? 'shadow-[0_0_8px_2px_rgba(46,230,255,0.5)] duration-75' : 'duration-300',
                )}
              >
                <Avatar src={members[p.userId]?.avatarUrl} fallback={p.handle ?? p.userId.slice(0, 2)} size="sm" className="!h-5 !w-5 !text-[9px]" />
              </div>
              <span className="truncate">{p.handle ?? p.userId.slice(0, 8)}</span>
              {isScreenSharing && (
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-cyan" aria-label="Streaming">
                  <title>Streaming</title>
                  <rect x="1" y="2" width="14" height="10" rx="1.5" />
                  <path d="M4 14h8" />
                  <path d="M6 12v2M10 12v2" />
                  <path d="M6.5 7l2-2 2 2" fill="none" />
                  <path d="M8.5 5v4" />
                </svg>
              )}
              {p.selfMute && (
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-danger/70" aria-label="Muted">
                  <rect x="5.5" y="1" width="5" height="8" rx="2.5" />
                  <path d="M3 7.5a5 5 0 0 0 10 0" />
                  <path d="M2 2l12 12" strokeWidth="2" />
                </svg>
              )}
              {p.selfDeaf && (
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="shrink-0 text-danger/70" aria-label="Deafened">
                  <path d="M3 7a5 5 0 0110 0v2a3 3 0 01-3 3H6a3 3 0 01-3-3V7z" />
                  <path d="M2 2l12 12" strokeWidth="1.5" stroke="currentColor" fill="none" strokeLinecap="round" />
                </svg>
              )}
            </div>
            );
          })}
        </div>
      )}

      {/* Per-user volume context menu */}
      {contextMenu && (
        <ParticipantContextMenu
          userId={contextMenu.userId}
          displayName={contextMenu.handle}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// User Panel
// ---------------------------------------------------------------------------

const ALLOWED_AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif']);
const MAX_AVATAR_INPUT_SIZE = 5 * 1024 * 1024; // 5 MB source before crop
const MIN_AVATAR_DIMENSION = 128;

function UserPanel() {
  const toast = useToast();
  const handle = useAuthStore((s) => s.handle);
  const userId = useAuthStore((s) => s.userId);
  const avatarUrl = useAuthStore((s) => s.avatarUrl);
  const setAvatarUrl = useAuthStore((s) => s.setAvatarUrl);
  const logout = useAuthStore((s) => s.logout);
  const status = usePresenceStore((s) => userId ? s.presence[userId] ?? 'online' : 'online');

  // Avatar upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [cropImageType, setCropImageType] = useState('image/jpeg');

  const handleAvatarSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;

    if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
      toast.error('Avatar must be a JPG, PNG, or GIF image');
      return;
    }
    if (file.size > MAX_AVATAR_INPUT_SIZE) {
      toast.error('Image file must be under 5 MB');
      return;
    }

    // Validate minimum dimensions
    try {
      await new Promise<void>((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(url);
          if (img.width < MIN_AVATAR_DIMENSION || img.height < MIN_AVATAR_DIMENSION) {
            reject(new Error(`Image must be at least ${MIN_AVATAR_DIMENSION}x${MIN_AVATAR_DIMENSION} pixels`));
          } else {
            resolve();
          }
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
        img.src = url;
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Invalid image');
      return;
    }

    setCropImageSrc(URL.createObjectURL(file));
    setCropImageType(file.type);
    setCropDialogOpen(true);
  }, [toast]);

  const handleCropConfirm = useCallback(async (croppedFile: File) => {
    setCropDialogOpen(false);
    if (cropImageSrc) {
      URL.revokeObjectURL(cropImageSrc);
      setCropImageSrc(null);
    }
    if (!userId) return;

    setUploading(true);
    try {
      await uploadUserAvatar(userId, croppedFile);
      const newAvatarUrl = `${getUserAvatarUrl(userId)}?t=${Date.now()}`;
      setAvatarUrl(newAvatarUrl);
      toast.success('Avatar updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload avatar');
    } finally {
      setUploading(false);
    }
  }, [userId, setAvatarUrl, toast, cropImageSrc]);

  const handleCropDialogChange = useCallback((open: boolean) => {
    setCropDialogOpen(open);
    if (!open && cropImageSrc) {
      URL.revokeObjectURL(cropImageSrc);
      setCropImageSrc(null);
    }
  }, [cropImageSrc]);

  const version = getAppVersion();

  return (
    <div>
      <div className="flex items-center gap-2 border-t border-border bg-surface-1/50 px-3 py-2">
        {/* Clickable avatar — opens file picker for upload */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="group relative shrink-0 rounded-full"
          title="Change avatar"
          disabled={uploading}
        >
          <Avatar src={avatarUrl ?? undefined} fallback={handle ?? '?'} size="sm" />
          {/* Camera overlay on hover */}
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="white">
              <path d="M5.5 3L4.6 1.6A1 1 0 005.5 0h5a1 1 0 00.9.6L12.5 3H14a2 2 0 012 2v7a2 2 0 01-2 2H2a2 2 0 01-2-2V5a2 2 0 012-2h1.5zM8 12a3.5 3.5 0 100-7 3.5 3.5 0 000 7z" />
            </svg>
          </div>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif"
          className="hidden"
          onChange={handleAvatarSelect}
        />
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-medium text-text-primary">
            {handle ?? 'Unknown'}
          </p>
          <p className="text-xs text-text-muted capitalize">{status}</p>
        </div>
        <button
          onClick={logout}
          className="rounded-md p-1.5 text-text-muted hover:bg-surface-2 hover:text-text-secondary transition-colors"
          title="Log out"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3M11 11l3-3-3-3M14 8H6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Crop dialog for avatar */}
        {cropImageSrc && (
          <IconCropDialog
            open={cropDialogOpen}
            onOpenChange={handleCropDialogChange}
            imageSrc={cropImageSrc}
            imageType={cropImageType}
            onCropConfirm={handleCropConfirm}
          />
        )}
      </div>

      {/* Version footer */}
      <div className="flex items-center justify-center border-t border-border/50 bg-surface-1/30 py-1">
        <span className="text-[10px] text-text-muted/50 select-none">
          Ripcord v{version}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChannelSidebar() {
  const hubs = useHubStore((s) => s.hubs);
  const activeHubId = useHubStore((s) => s.activeHubId);
  const channels = useHubStore((s) => s.channels);
  const activeChannelId = useHubStore((s) => s.activeChannelId);

  const activeHub = hubs.find((s) => s.id === activeHubId);

  const textChannels = channels.filter((c) => c.type === 'text');
  const voiceChannels = channels.filter((c) => c.type === 'voice');

  return (
    <div className="flex h-full w-60 flex-col bg-surface-1">
      {/* Hub header with settings */}
      <div className="flex h-12 items-center justify-between border-b border-border px-4">
        <h2 className="truncate text-base font-semibold text-text-primary">
          {activeHub?.name ?? 'Ripcord'}
        </h2>
        {activeHub && (
          <AdminConsole
            hubId={activeHub.id}
            hubName={activeHub.name}
            trigger={
              <button className="rounded-md p-1 text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors" title="Hub Settings">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M8 10a2 2 0 100-4 2 2 0 000 4z" />
                  <path d="M13.5 8a5.5 5.5 0 01-.15 1.28l1.26.73a.5.5 0 01.12.64l-1.2 2.08a.5.5 0 01-.61.22l-1.49-.6a5.5 5.5 0 01-1.1.64l-.23 1.58a.5.5 0 01-.49.43H6.4a.5.5 0 01-.49-.42l-.23-1.59a5.5 5.5 0 01-1.1-.64l-1.49.6a.5.5 0 01-.61-.22l-1.2-2.08a.5.5 0 01.12-.64l1.26-.73A5.5 5.5 0 012.5 8c0-.44.05-.87.15-1.28l-1.26-.73a.5.5 0 01-.12-.64l1.2-2.08a.5.5 0 01.61-.22l1.49.6a5.5 5.5 0 011.1-.64l.23-1.58A.5.5 0 016.4 1h2.2a.5.5 0 01.49.42l.23 1.59a5.5 5.5 0 011.1.64l1.49-.6a.5.5 0 01.61.22l1.2 2.08a.5.5 0 01-.12.64l-1.26.73c.1.41.16.84.16 1.28z" />
                </svg>
              </button>
            }
          />
        )}
      </div>

      {/* Channel list */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {textChannels.length > 0 && (
            <div className="mb-2">
              <div className="mb-1 flex items-center justify-between px-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Text Channels
                </p>
                {activeHubId && (
                  <CreateChannelDialog
                    hubId={activeHubId}
                    trigger={
                      <button className="rounded p-0.5 text-text-muted hover:text-text-primary transition-colors">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M7 2v10M2 7h10" strokeLinecap="round" />
                        </svg>
                      </button>
                    }
                  />
                )}
              </div>
              {textChannels.map((ch) => (
                <ChannelItem key={ch.id} channel={ch} isActive={ch.id === activeChannelId} />
              ))}
            </div>
          )}

          {voiceChannels.length > 0 && (
            <>
              <Separator className="my-2" />
              <div>
                <div className="mb-1 flex items-center justify-between px-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Voice Channels
                  </p>
                  {activeHubId && (
                    <CreateChannelDialog
                      hubId={activeHubId}
                      trigger={
                        <button className="rounded p-0.5 text-text-muted hover:text-text-primary transition-colors">
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M7 2v10M2 7h10" strokeLinecap="round" />
                          </svg>
                        </button>
                      }
                    />
                  )}
                </div>
                {voiceChannels.map((ch) => (
                  <VoiceChannelItem key={ch.id} channel={ch} isActive={ch.id === activeChannelId} />
                ))}
              </div>
            </>
          )}

          {channels.length === 0 && (
            <p className="px-2 py-4 text-center text-sm text-text-muted">
              No channels yet
            </p>
          )}
        </div>
      </ScrollArea>

      {/* Voice panel */}
      <VoicePanel />

      {/* User panel */}
      <UserPanel />
    </div>
  );
}
