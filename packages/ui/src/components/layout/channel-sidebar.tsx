/**
 * @module channel-sidebar
 * ORBIT-styled second-column sidebar. Glass-panel aesthetic with channel lists,
 * DM tabs, voice panel, user panel. Semi-transparent over ambient background.
 */
'use client';

import { useHubStore, type Channel } from '../../stores/server-store';
import { useAuthStore } from '../../stores/auth-store';
import { useReadStateStore } from '../../stores/read-state-store';
import { useMessageStore } from '../../stores/message-store';
import { ScrollArea } from '../ui/scroll-area';
import { Avatar } from '../ui/avatar';
import clsx from 'clsx';
import { usePresenceStore } from '../../stores/presence-store';
import { useVoiceStateStore, EMPTY_PARTICIPANTS } from '../../stores/voice-state-store';
import { useSettingsStore } from '../../stores/settings-store';
import { useMemberStore } from '../../stores/member-store';
import { VoicePanel } from '../voice/voice-panel';
import { ParticipantContextMenu } from '../voice/participant-context-menu';
import { CreateChannelDialog } from '../hub/create-channel-dialog';
import { AdminConsole } from '../admin/admin-console';
import { DmChannelList } from '../dm/dm-channel-list';
import { FriendsPanel } from '../friends/friends-panel';
import { IconCropDialog } from '../admin/icon-crop-dialog';
import { AppearanceSettings } from '../settings/appearance-settings';
import { Tooltip } from '../ui/tooltip';
import { uploadUserAvatar, getUserAvatarUrl } from '../../lib/user-api';
import { gateway } from '../../lib/gateway-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '../ui/toast';
import { getAppVersion } from '../../lib/constants';
import { useHasPermission } from '../../hooks/use-has-permission';
import { Permission } from '@ripcord/types';
import { apiFetch } from '../../lib/api';

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
        'flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm transition-all duration-200',
        isActive
          ? 'bg-white/10 text-text-primary border border-accent/30 shadow-sm shadow-accent/10'
          : 'text-text-muted hover:bg-white/5 hover:text-text-secondary border border-transparent',
      )}
    >
      {icon}
      <span className="truncate">{channel.name}</span>
      {unreadCount > 0 && !isActive && (
        <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-magenta px-1.5 text-[10px] font-bold text-white shadow-sm shadow-accent-magenta/20">
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
  const activeHubId = useHubStore((s) => s.activeHubId);
  const participants = useVoiceStateStore((s) => s.voiceStates[channel.id] ?? EMPTY_PARTICIPANTS);
  const speakingUserIds = useVoiceStateStore((s) => s.speakingUserIds);
  const screenSharingUserIds = useVoiceStateStore((s) => s.screenSharingUserIds);
  const members = useMemberStore((s) => s.members);
  const currentUserId = useAuthStore((s) => s.userId);

  // Admin drag-and-drop permission
  const canMove = useHasPermission(Permission.MOVE_MEMBERS);
  const [dragOver, setDragOver] = useState(false);

  const toast = useToast();

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (!canMove || !activeHubId) return;
    const sourceUserId = e.dataTransfer.getData('text/participant-userId');
    const sourceChannelId = e.dataTransfer.getData('text/participant-channelId');
    if (!sourceUserId || !sourceChannelId || sourceChannelId === channel.id) return;
    const res = await apiFetch('/v1/voice/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hubId: activeHubId,
        channelId: sourceChannelId,
        targetChannelId: channel.id,
        userId: sourceUserId,
      }),
    });
    if (!res.ok) toast.error(res.error ?? 'Failed to move user');
  }, [canMove, activeHubId, channel.id, toast]);

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
        onDragOver={(e) => {
          if (!canMove) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={clsx(
          'flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm transition-all duration-200',
          dragOver && 'ring-2 ring-accent ring-inset',
          isActive
            ? 'bg-white/10 text-text-primary border border-accent/30 shadow-sm shadow-accent/10'
            : 'text-text-muted hover:bg-white/5 hover:text-text-secondary border border-transparent',
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
          <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-accent/20 px-1.5 text-[10px] font-medium text-accent">
            {participants.length}
          </span>
        )}
      </button>

      {/* Participant list */}
      {participants.length > 0 && (
        <div className="ml-4 border-l border-accent/20 pl-3 py-0.5">
          {participants.map((p) => {
            const isSpeaking = speakingUserIds.includes(p.userId);
            const isScreenSharing = screenSharingUserIds.includes(p.userId);
            return (
            <div
              key={p.userId}
              draggable={canMove && p.userId !== currentUserId}
              onDragStart={(e) => {
                if (!canMove) return;
                e.dataTransfer.setData('text/participant-userId', p.userId);
                e.dataTransfer.setData('text/participant-channelId', channel.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              className={clsx(
                'flex items-center gap-2 py-0.5 text-xs text-text-muted select-none',
                canMove && p.userId !== currentUserId ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
              )}
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
                  'flex items-center justify-center shrink-0 rounded-full',
                  isSpeaking && 'shadow-[0_0_8px_2px_rgba(0,240,255,0.5)]',
                )}
                style={{ width: 'var(--icon-size-base, 32px)', height: 'var(--icon-size-base, 32px)' }}
              >
                <Avatar src={members[p.userId]?.avatarUrl} fallback={p.handle ?? p.userId.slice(0, 2)} size="sm" style={{ width: 'var(--icon-size-base, 32px)', height: 'var(--icon-size-base, 32px)', fontSize: 'calc(var(--icon-size-base, 32px) * 0.4)' }} />
              </div>
              <span className="truncate" style={{ fontSize: 'var(--font-size-base, 14px)', color: 'var(--color-username, var(--color-text-primary))' }}>{p.handle ?? p.userId.slice(0, 8)}</span>
              {isScreenSharing && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    useVoiceStateStore.getState().setActiveScreenShareId(p.userId);
                  }}
                  onMouseEnter={(e) => {
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    useVoiceStateStore.getState().setHoveredScreenShare(p.userId, {
                      x: rect.right + 8,
                      y: rect.top,
                    });
                  }}
                  onMouseLeave={() => {
                    useVoiceStateStore.getState().setHoveredScreenShare(null);
                  }}
                  className="shrink-0 text-cyan hover:brightness-125 hover:scale-110 transition-all cursor-pointer"
                  title={`View ${p.handle ?? 'user'}'s screen`}
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-label="Streaming">
                    <rect x="1" y="2" width="14" height="10" rx="1.5" />
                    <path d="M4 14h8" />
                    <path d="M6 12v2M10 12v2" />
                    <path d="M6.5 7l2-2 2 2" fill="none" />
                    <path d="M8.5 5v4" />
                  </svg>
                </button>
              )}
              {p.serverMute && (
                <Tooltip content="Server Muted" side="top">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-warning" aria-label="Server Muted">
                    <rect x="5.5" y="1" width="5" height="8" rx="2.5" />
                    <path d="M3 7.5a5 5 0 0 0 10 0" />
                    <path d="M2 2l12 12" strokeWidth="2" />
                  </svg>
                </Tooltip>
              )}
              {p.selfMute && !p.serverMute && (
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

      {/* Per-user volume / admin context menu */}
      {contextMenu && (
        <ParticipantContextMenu
          userId={contextMenu.userId}
          displayName={contextMenu.handle}
          channelId={channel.id}
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

function UserPanel({ pinned, onTogglePin }: { pinned: boolean; onTogglePin: () => void }) {
  const toast = useToast();
  const handle = useAuthStore((s) => s.handle);
  const userId = useAuthStore((s) => s.userId);
  const avatarUrl = useAuthStore((s) => s.avatarUrl);
  const setAvatarUrl = useAuthStore((s) => s.setAvatarUrl);
  const logout = useAuthStore((s) => s.logout);
  const status = usePresenceStore((s) => userId ? s.presence[userId] ?? 'online' : 'online');
  const [appearanceOpen, setAppearanceOpen] = useState(false);

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

  // Voice control state (bridged from LiveKit via store)
  const connectedChannelId = useVoiceStateStore((s) => s.connectedChannelId);
  const localMicMuted = useVoiceStateStore((s) => s.localMicMuted);
  const toggleMicFn = useVoiceStateStore((s) => s.toggleMicFn);
  const isDeafened = useSettingsStore((s) => s.isDeafened);
  const toggleDeafen = useSettingsStore((s) => s.toggleDeafen);

  const handleToggleDeafen = useCallback(() => {
    const newDeafState = !isDeafened;
    toggleDeafen();

    if (connectedChannelId && userId) {
      // Optimistic update: instantly show deafen icon in sidebar participant list
      useVoiceStateStore.getState().updateParticipant(connectedChannelId, userId, {
        selfMute: localMicMuted,
        selfDeaf: newDeafState,
      });

      // Notify gateway so other users see the deafen change
      gateway.send(23, {
        channelId: connectedChannelId,
        userId,
        action: 'update',
        selfMute: localMicMuted,
        selfDeaf: newDeafState,
      });
    }
  }, [isDeafened, toggleDeafen, connectedChannelId, userId, localMicMuted]);

  const version = getAppVersion();
  const inVoice = connectedChannelId !== null;

  return (
    <div>
      <div className="flex items-center gap-2 border-t border-white/5 bg-surface-1/30 backdrop-blur-sm px-3 py-2">
        {/* Clickable avatar — opens file picker for upload */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="group relative shrink-0 rounded-full"
          title="Change avatar"
          disabled={uploading}
        >
          <div className="rounded-full bg-gradient-to-r from-accent/50 to-accent-violet/50 p-[1px]">
            <Avatar src={avatarUrl ?? undefined} fallback={handle ?? '?'} size="sm" style={{ width: 'var(--icon-size-base, 32px)', height: 'var(--icon-size-base, 32px)', fontSize: 'calc(var(--icon-size-base, 32px) * 0.35)' }} />
          </div>
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
          <p className="truncate font-medium text-text-primary" style={{ fontSize: 'var(--font-size-sm, 12px)' }}>
            {handle ?? 'Unknown'}
          </p>
          <p className="text-accent/80 capitalize" style={{ fontSize: 'var(--font-size-xs, 10px)' }}>{status}</p>
        </div>

        {/* Mic / Deafen buttons (visible when in voice) */}
        {inVoice && (
          <>
            <Tooltip content={localMicMuted ? 'Unmute' : 'Mute'} side="top">
              <button
                onClick={() => toggleMicFn?.()}
                className={clsx(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors',
                  localMicMuted
                    ? 'bg-danger/20 text-danger hover:bg-danger/30'
                    : 'bg-white/5 text-text-secondary hover:bg-white/10 hover:text-text-primary',
                )}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5.5" y="1" width="5" height="8" rx="2.5" />
                  <path d="M3 7.5a5 5 0 0 0 10 0" />
                  <path d="M8 12v2.5" />
                  <path d="M5.5 14.5h5" />
                  {localMicMuted && <path d="M2 2l12 12" strokeWidth="2" />}
                </svg>
              </button>
            </Tooltip>
            <Tooltip content={isDeafened ? 'Undeafen' : 'Deafen'} side="top">
              <button
                onClick={handleToggleDeafen}
                className={clsx(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors',
                  isDeafened
                    ? 'bg-danger/20 text-danger hover:bg-danger/30'
                    : 'bg-white/5 text-text-secondary hover:bg-white/10 hover:text-text-primary',
                )}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 10V8a6 6 0 0 1 12 0v2" />
                  <rect x="1" y="10" width="3" height="4" rx="1" />
                  <rect x="12" y="10" width="3" height="4" rx="1" />
                  {isDeafened && <path d="M2 2l12 12" strokeWidth="2" />}
                </svg>
              </button>
            </Tooltip>
          </>
        )}

        <Tooltip content={pinned ? 'Unpin panel' : 'Pin panel open'} side="top">
          <button
            onClick={onTogglePin}
            className={clsx(
              'rounded-md p-1.5 transition-all',
              pinned
                ? 'text-accent hover:bg-white/5'
                : 'text-white/30 hover:bg-white/5 hover:text-accent rotate-45',
            )}
            title={pinned ? 'Unpin panel' : 'Pin panel open'}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill={pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9.828 1.172a1 1 0 011.414 0l3.586 3.586a1 1 0 010 1.414L12 9l-1 4-4-4-4.5 4.5M7 9L2.172 4.172l2.828-2.829L9.828 6" />
            </svg>
          </button>
        </Tooltip>

        <Tooltip content="Appearance" side="top">
          <button
            onClick={() => setAppearanceOpen(true)}
            className="rounded-md p-1.5 text-text-muted hover:bg-white/5 hover:text-accent transition-colors"
            title="Appearance settings"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="8" cy="8" r="3" />
              <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" />
            </svg>
          </button>
        </Tooltip>

        <button
          onClick={logout}
          className="rounded-md p-1.5 text-text-muted hover:bg-white/5 hover:text-danger transition-colors"
          title="Log out"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3M11 11l3-3-3-3M14 8H6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Appearance settings dialog */}
        <AppearanceSettings open={appearanceOpen} onClose={() => setAppearanceOpen(false)} />

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
      <div className="flex items-center justify-center border-t border-white/5 bg-surface-1/20 py-1">
        <span className="text-[10px] text-text-muted/50 select-none font-mono">
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
  const isDmView = useHubStore((s) => s.isDmView);

  const sidebarWidth = useSettingsStore((s) => s.channelSidebarWidth);
  const setSidebarWidth = useSettingsStore((s) => s.setChannelSidebarWidth);
  const resizingRef = useRef(false);

  // Drag-to-resize handler — uses document-level mousemove/mouseup
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    const startX = e.clientX;
    const startWidth = useSettingsStore.getState().channelSidebarWidth;

    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const newWidth = startWidth + (ev.clientX - startX);
      setSidebarWidth(newWidth);
    };
    const onUp = () => {
      resizingRef.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [setSidebarWidth]);

  const [dmTab, setDmTab] = useState<'friends' | 'messages'>('friends');

  // Collapsible bottom panel state
  const [panelPinned, setPanelPinned] = useState(() => {
    try { return localStorage.getItem('ripcord-panel-pinned') === 'true'; } catch { return true; }
  });
  const [panelHovered, setPanelHovered] = useState(false);
  const panelExpanded = panelPinned || panelHovered;
  const avatarUrl = useAuthStore((s) => s.avatarUrl);
  const userHandle = useAuthStore((s) => s.handle);
  const togglePanelPin = useCallback(() => {
    setPanelPinned((prev) => {
      const next = !prev;
      try { localStorage.setItem('ripcord-panel-pinned', String(next)); } catch { /* noop */ }
      return next;
    });
  }, []);

  const activeHub = hubs.find((s) => s.id === activeHubId);

  const textChannels = channels.filter((c) => c.type === 'text');
  const voiceChannels = channels.filter((c) => c.type === 'voice');

  return (
    <div className="relative flex h-full flex-col glass-panel border-r border-white/5" style={{ width: sidebarWidth }}>
      {/* Header */}
      <div className="flex h-12 items-center justify-between border-b border-white/5 px-4">
        <h2 className="truncate text-base font-semibold display-text text-text-primary">
          {isDmView ? 'Direct Messages' : (activeHub?.name ?? 'Ripcord')}
        </h2>
        {activeHub && !isDmView && (
          <AdminConsole
            hubId={activeHub.id}
            hubName={activeHub.name}
            trigger={
              <button className="rounded-lg p-1.5 text-text-muted hover:text-accent hover:bg-white/5 transition-colors" title="Hub Settings">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M8 10a2 2 0 100-4 2 2 0 000 4z" />
                  <path d="M13.5 8a5.5 5.5 0 01-.15 1.28l1.26.73a.5.5 0 01.12.64l-1.2 2.08a.5.5 0 01-.61.22l-1.49-.6a5.5 5.5 0 01-1.1.64l-.23 1.58a.5.5 0 01-.49.43H6.4a.5.5 0 01-.49-.42l-.23-1.59a5.5 5.5 0 01-1.1-.64l-1.49.6a.5.5 0 01-.61-.22l-1.2-2.08a.5.5 0 01.12-.64l1.26-.73A5.5 5.5 0 012.5 8c0-.44.05-.87.15-1.28l-1.26-.73a.5.5 0 01-.12-.64l1.2-2.08a.5.5 0 01.61-.22l1.49.6a5.5 5.5 0 011.1-.64l.23-1.58A.5.5 0 016.4 1h2.2a.5.5 0 01.49.42l.23 1.59a5.5 5.5 0 011.1.64l1.49-.6a.5.5 0 01.61.22l1.2 2.08a.5.5 0 01-.12.64l-1.26.73c.1.41.16.84.16 1.28z" />
                </svg>
              </button>
            }
          />
        )}
      </div>

      {/* Hub banner */}
      {activeHub?.bannerUrl && !isDmView && (
        <div className="h-24 w-full shrink-0 overflow-hidden border-b border-white/5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={activeHub.bannerUrl}
            alt={`${activeHub.name} banner`}
            className="h-full w-full object-cover"
          />
        </div>
      )}

      {/* Channel list or DM list */}
      <ScrollArea className="flex-1">
        {isDmView ? (
          <div className="flex h-full flex-col">
            {/* Tab bar */}
            <div className="flex border-b border-white/5 px-2">
              <button
                className={clsx(
                  'px-3 py-2 text-xs font-medium transition-colors',
                  dmTab === 'friends' ? 'text-accent border-b-2 border-accent' : 'text-text-muted hover:text-text-secondary',
                )}
                onClick={() => setDmTab('friends')}
              >
                Friends
              </button>
              <button
                className={clsx(
                  'px-3 py-2 text-xs font-medium transition-colors',
                  dmTab === 'messages' ? 'text-accent border-b-2 border-accent' : 'text-text-muted hover:text-text-secondary',
                )}
                onClick={() => setDmTab('messages')}
              >
                Messages
              </button>
            </div>
            {/* Tab content */}
            <div className="flex-1 overflow-hidden">
              {dmTab === 'friends' ? <FriendsPanel /> : <DmChannelList />}
            </div>
          </div>
        ) : (
          <div className="p-2">
            {textChannels.length > 0 && (
              <div className="mb-2">
                <div className="mb-1 flex items-center justify-between px-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
                    Text Channels
                  </p>
                  {activeHubId && (
                    <CreateChannelDialog
                      hubId={activeHubId}
                      trigger={
                        <button className="rounded p-0.5 text-text-muted hover:text-accent transition-colors">
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
                <div className="my-2 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                <div>
                  <div className="mb-1 flex items-center justify-between px-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
                      Voice Channels
                    </p>
                    {activeHubId && (
                      <CreateChannelDialog
                        hubId={activeHubId}
                        trigger={
                          <button className="rounded p-0.5 text-text-muted hover:text-accent transition-colors">
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
        )}
      </ScrollArea>

      {/* Collapsible bottom controls — hover to expand, pin to persist */}
      <div
        onMouseEnter={() => setPanelHovered(true)}
        onMouseLeave={() => setPanelHovered(false)}
        className="mt-auto"
      >
        {/* VoicePanel: always mounted (hidden when collapsed) to preserve LiveKit connection */}
        <div className={panelExpanded ? '' : 'hidden'}>
          <VoicePanel />
        </div>

        {panelExpanded ? (
          <UserPanel pinned={panelPinned} onTogglePin={togglePanelPin} />
        ) : (
          /* Collapsed: "Node Commands" label */
          <div className="flex items-center justify-center border-t border-white/5 bg-surface-1/30 backdrop-blur-sm py-2 cursor-pointer">
            <span className="text-xs font-bold text-danger tracking-wide uppercase">Node Commands</span>
          </div>
        )}
      </div>

      {/* Resize handle — cyan glow on hover */}
      <div
        onMouseDown={handleResizeStart}
        className="absolute top-0 right-0 z-10 h-full w-1 cursor-col-resize hover:bg-accent/30 active:bg-accent/50 transition-colors"
      />
    </div>
  );
}
