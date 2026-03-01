/**
 * @module server-sidebar
 * ORBIT-styled far-left icon rail (80px). Hub icons, Home button (DM toggle),
 * and AddHubDialog button. Glass morphism over the ambient background.
 */
'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useHubStore, type Hub } from '../../stores/server-store';
import { useAuthStore } from '../../stores/auth-store';
import { useReadStateStore } from '../../stores/read-state-store';
import { useMessageStore } from '../../stores/message-store';
import { useSettingsStore } from '../../stores/settings-store';
import { Tooltip } from '../ui/tooltip';
import { ScrollArea } from '../ui/scroll-area';
import { AddHubDialog } from '../hub/create-hub-dialog';
import { HubContextMenu } from '../hub/hub-context-menu';
import { Avatar } from '../ui/avatar';
import { IconCropDialog } from '../admin/icon-crop-dialog';
import { uploadUserAvatar, getUserAvatarUrl } from '../../lib/user-api';
import { useToast } from '../ui/toast';
import clsx from 'clsx';

// ---------------------------------------------------------------------------
// Avatar upload constants
// ---------------------------------------------------------------------------

const ALLOWED_AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif']);
const MAX_AVATAR_INPUT_SIZE = 5 * 1024 * 1024; // 5 MB source before crop
const MIN_AVATAR_DIMENSION = 128;

// ---------------------------------------------------------------------------
// User Avatar Button — clickable for avatar change, bounces within border
// ---------------------------------------------------------------------------

function UserAvatarButton() {
  const userHandle = useAuthStore((s) => s.handle);
  const userAvatarUrl = useAuthStore((s) => s.avatarUrl);
  const setAvatarUrl = useAuthStore((s) => s.setAvatarUrl);
  const userId = useAuthStore((s) => s.userId);
  const toast = useToast();

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

  return (
    <>
      {/* Bounce containment area */}
      <div className="rounded-xl p-0.5">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="group relative animate-gentle-bounce"
          title="Change avatar"
          disabled={uploading}
        >
          <div className="rounded-full border-2 border-accent/30 p-[1px]">
            <Avatar
              src={userAvatarUrl ?? undefined}
              fallback={userHandle ?? '?'}
              size="sm"
              style={{ width: '32px', height: '32px', fontSize: '11px' }}
            />
          </div>
          {/* Camera overlay on hover */}
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="white">
              <path d="M5.5 3L4.6 1.6A1 1 0 005.5 0h5a1 1 0 00.9.6L12.5 3H14a2 2 0 012 2v7a2 2 0 01-2 2H2a2 2 0 01-2-2V5a2 2 0 012-2h1.5zM8 12a3.5 3.5 0 100-7 3.5 3.5 0 000 7z" />
            </svg>
          </div>
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif"
        className="hidden"
        onChange={handleAvatarSelect}
      />

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
    </>
  );
}

// ---------------------------------------------------------------------------
// Hub Icon
// ---------------------------------------------------------------------------

function HubIcon({ hub, isActive }: { hub: Hub; isActive: boolean }) {
  const setActiveHub = useHubStore((s) => s.setActiveHub);
  const currentUserId = useAuthStore((s) => s.userId);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  return (
    <>
      <Tooltip content={hub.name} side="right">
        <button
          onClick={() => setActiveHub(hub.id)}
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenu({ x: e.clientX, y: e.clientY });
          }}
          className={clsx(
            'group relative flex h-12 w-12 items-center justify-center transition-all duration-200',
            isActive
              ? 'rounded-2xl bg-accent text-black shadow-lg shadow-accent/20'
              : 'rounded-xl bg-white/5 text-text-secondary border border-white/10 hover:rounded-2xl hover:bg-white/10 hover:border-accent/50 hover:text-accent',
          )}
        >
          {/* Active indicator pill — cyan glow */}
          <span
            className={clsx(
              'absolute -left-3 w-1 rounded-r-full transition-all duration-200',
              isActive ? 'h-10 bg-accent shadow-[0_0_8px_rgba(0,240,255,0.5)]' : 'h-0 group-hover:h-5 bg-accent',
            )}
          />

          {hub.iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={hub.iconUrl}
              alt={hub.name}
              className="h-full w-full rounded-[inherit] object-cover"
            />
          ) : (
            <span className="text-sm font-semibold">
              {hub.name.slice(0, 2).toUpperCase()}
            </span>
          )}
        </button>
      </Tooltip>

      {contextMenu && (
        <HubContextMenu
          hubId={hub.id}
          hubName={hub.name}
          isOwner={hub.ownerId === currentUserId}
          position={contextMenu}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Home Button
// ---------------------------------------------------------------------------

function HomeButton() {
  const isDmView = useHubStore((s) => s.isDmView);
  const enterDmView = useHubStore((s) => s.enterDmView);
  const dmChannels = useHubStore((s) => s.dmChannels);
  const readStates = useReadStateStore((s) => s.readStates);
  const allMessages = useMessageStore((s) => s.messages);

  // Aggregate unread counts across all DM channels
  const totalUnread = useMemo(() => {
    let total = 0;
    for (const dm of dmChannels) {
      const messages = allMessages[dm.channelId];
      if (!messages || messages.length === 0) continue;
      const lastReadId = readStates[dm.channelId]?.lastReadMessageId;
      if (lastReadId) {
        const lastReadIdx = messages.findIndex((m) => m.id === lastReadId);
        if (lastReadIdx >= 0) {
          total += messages.length - lastReadIdx - 1;
        } else {
          total += messages.length;
        }
      } else {
        total += messages.length;
      }
    }
    return total;
  }, [dmChannels, readStates, allMessages]);

  return (
    <Tooltip content="Direct Messages" side="right">
      <button
        onClick={enterDmView}
        className={clsx(
          'group relative flex h-12 w-12 items-center justify-center transition-all duration-200',
          isDmView
            ? 'rounded-2xl bg-gradient-to-br from-accent to-accent-violet text-black shadow-lg shadow-accent/20 animate-pulse-glow'
            : 'rounded-xl bg-white/5 text-text-secondary border border-white/10 hover:rounded-2xl hover:bg-white/10 hover:border-accent/50 hover:text-accent',
        )}
      >
        {/* Active indicator pill */}
        <span
          className={clsx(
            'absolute -left-3 w-1 rounded-r-full transition-all duration-200',
            isDmView ? 'h-10 bg-accent shadow-[0_0_8px_rgba(0,240,255,0.5)]' : 'h-0 group-hover:h-5 bg-accent',
          )}
        />
        <svg width="24" height="24" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M8 4h10c4.42 0 8 2.69 8 6s-3.58 6-8 6h-2l8 12h-5.5L11 16H12c3.31 0 6-1.34 6-4s-2.69-4-6-4h-4v18H8V4z" fill="currentColor" />
          <path d="M6 2l4 2v24l-4 2V2z" fill="currentColor" opacity="0.6" />
        </svg>

        {/* Unread DM badge */}
        {totalUnread > 0 && !isDmView && (
          <span className="absolute -bottom-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-magenta px-1 text-[10px] font-bold text-white shadow-lg shadow-accent-magenta/30">
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </button>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// Pin Button
// ---------------------------------------------------------------------------

function PinButton({ pinned, onToggle }: { pinned: boolean; onToggle: () => void }) {
  return (
    <Tooltip content={pinned ? 'Unpin sidebar' : 'Pin sidebar'} side="right">
      <button
        onClick={onToggle}
        className={clsx(
          'flex h-6 w-6 items-center justify-center rounded-md transition-colors',
          pinned
            ? 'text-accent hover:text-accent/70'
            : 'text-text-muted hover:text-text-primary',
        )}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill={pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 17v5" />
          <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 2-2H6a2 2 0 0 0 2 2 1 1 0 0 1 1 1z" />
        </svg>
      </button>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HubSidebar() {
  const hubs = useHubStore((s) => s.hubs);
  const activeHubId = useHubStore((s) => s.activeHubId);
  const hubPinned = useSettingsStore((s) => s.hubSidebarPinned);
  const togglePin = useSettingsStore((s) => s.toggleHubSidebarPin);
  const [hovered, setHovered] = useState(false);
  const expanded = hubPinned || hovered;

  return (
    <div
      className={clsx(
        'relative flex h-full flex-col items-center border-r border-white/5 bg-surface-1/50 backdrop-blur-xl py-6 transition-all duration-200 overflow-hidden',
        expanded ? 'w-20 gap-6' : 'w-4 gap-0',
      )}
      onMouseEnter={() => { if (!hubPinned) setHovered(true); }}
      onMouseLeave={() => { if (!hubPinned) setHovered(false); }}
    >
      {/* Collapsed indicator — subtle vertical accent line */}
      {!expanded && (
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 bg-accent/20 rounded-full my-8" />
      )}

      {/* Content — fades when collapsed */}
      <div
        className={clsx(
          'flex h-full w-20 flex-col items-center gap-6 transition-opacity duration-200',
          expanded ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
      >
        <HomeButton />

        {/* Gradient divider */}
        <div className="w-8 h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent" />

        <ScrollArea className="flex-1 w-full">
          <div className="flex flex-col items-center gap-3 px-4">
            {hubs.map((hub) => (
              <HubIcon
                key={hub.id}
                hub={hub}
                isActive={hub.id === activeHubId}
              />
            ))}

            {/* Add Hub Button */}
            <AddHubDialog
              trigger={
                <button
                  className={clsx(
                    'flex h-12 w-12 items-center justify-center rounded-xl bg-white/5 text-success',
                    'border border-white/10 transition-all duration-200',
                    'hover:rounded-2xl hover:bg-success/20 hover:border-success/50 hover:text-success hover:shadow-lg hover:shadow-success/10',
                  )}
                  title="Add a Hub"
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10 4v12M4 10h12" strokeLinecap="round" />
                  </svg>
                </button>
              }
            />
          </div>
        </ScrollArea>

        {/* User Avatar + Pin button — bottom of rail */}
        <div className="mt-auto flex flex-col items-center gap-2">
          <UserAvatarButton />
          <PinButton pinned={hubPinned} onToggle={togglePin} />
        </div>
      </div>
    </div>
  );
}
