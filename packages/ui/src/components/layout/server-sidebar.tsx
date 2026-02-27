/**
 * @module server-sidebar
 * ORBIT-styled far-left icon rail (80px). Hub icons, Home button (DM toggle),
 * and AddHubDialog button. Glass morphism over the ambient background.
 */
'use client';

import { useMemo, useState } from 'react';
import { useHubStore, type Hub } from '../../stores/server-store';
import { useAuthStore } from '../../stores/auth-store';
import { useReadStateStore } from '../../stores/read-state-store';
import { useMessageStore } from '../../stores/message-store';
import { Tooltip } from '../ui/tooltip';
import { ScrollArea } from '../ui/scroll-area';
import { AddHubDialog } from '../hub/create-hub-dialog';
import { HubContextMenu } from '../hub/hub-context-menu';
import { Avatar } from '../ui/avatar';
import clsx from 'clsx';

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
// Component
// ---------------------------------------------------------------------------

export function HubSidebar() {
  const hubs = useHubStore((s) => s.hubs);
  const activeHubId = useHubStore((s) => s.activeHubId);
  const userHandle = useAuthStore((s) => s.handle);
  const userAvatarUrl = useAuthStore((s) => s.avatarUrl);

  return (
    <div className="flex h-full w-20 flex-col items-center border-r border-white/5 bg-surface-1/50 backdrop-blur-xl py-6 gap-6">
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

      {/* User Avatar — bottom of rail, gentle bounce */}
      <div className="mt-auto flex flex-col items-center gap-2">
        <div className="animate-gentle-bounce">
          <div className="rounded-full border-2 border-accent/30 p-[1px]">
            <Avatar
              src={userAvatarUrl ?? undefined}
              fallback={userHandle ?? '?'}
              size="sm"
              style={{ width: '32px', height: '32px', fontSize: '11px' }}
            />
          </div>
        </div>
        <div className="w-2 h-2 rounded-full bg-accent shadow-lg shadow-accent/50" />
      </div>
    </div>
  );
}
