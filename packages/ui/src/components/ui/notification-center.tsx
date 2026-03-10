/**
 * @module notification-center
 * Aggregated notification bell with unread channel list and friend requests.
 * Renders a popover anchored to a bell icon in the hub sidebar (88px rail).
 */
'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useHubStore } from '../../stores/server-store';
import { useMessageStore } from '../../stores/message-store';
import { useReadStateStore } from '../../stores/read-state-store';
import { useFriendStore } from '../../stores/friend-store';

// ---------------------------------------------------------------------------
// Bell SVG icon
// ---------------------------------------------------------------------------

function BellIcon({ className }: { className?: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M8 1.5a4 4 0 014 4v2.5c0 1 .5 2 1.5 2.5H2.5C3.5 10 4 9 4 8V5.5a4 4 0 014-4z" />
      <path d="M6.5 12.5a1.5 1.5 0 003 0" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UnreadChannel {
  channelId: string;
  channelName: string;
  hubName: string;
  hubId: string;
  unreadCount: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // --- Store selectors ---
  const hubs = useHubStore((s) => s.hubs);
  const activeHubChannels = useHubStore((s) => s.channels);
  const dmChannels = useHubStore((s) => s.dmChannels);
  const messages = useMessageStore((s) => s.messages);
  const readStates = useReadStateStore((s) => s.readStates);
  const pendingRequests = useFriendStore((s) => s.pendingIncoming);

  // --- Build lookup sets/maps ---

  // Set of DM channel IDs so we can exclude them from hub-unread calculation
  const dmChannelIds = useMemo(
    () => new Set(dmChannels.map((dm) => dm.channelId)),
    [dmChannels],
  );

  // Map channelId -> channel (only active-hub channels are available)
  const channelMap = useMemo(() => {
    const m = new Map<string, { name: string; hubId: string }>();
    for (const ch of activeHubChannels) {
      m.set(ch.id, { name: ch.name, hubId: ch.hubId });
    }
    return m;
  }, [activeHubChannels]);

  // Map hubId -> hub name
  const hubNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const hub of hubs) {
      m.set(hub.id, hub.name);
    }
    return m;
  }, [hubs]);

  // --- Compute unread channels (hub channels only, not DMs) ---
  const unreadChannels: UnreadChannel[] = useMemo(() => {
    const result: UnreadChannel[] = [];

    for (const [channelId, channelMessages] of Object.entries(messages)) {
      if (!channelMessages || channelMessages.length === 0) continue;
      // Skip DM channels — those are shown on the Home button badge
      if (dmChannelIds.has(channelId)) continue;

      const lastReadId = readStates[channelId]?.lastReadMessageId;
      let unreadCount = 0;

      if (lastReadId) {
        const lastReadIdx = channelMessages.findIndex((m) => m.id === lastReadId);
        if (lastReadIdx >= 0) {
          unreadCount = channelMessages.length - lastReadIdx - 1;
        } else {
          // Last-read message not found in current window — treat all as unread
          unreadCount = channelMessages.length;
        }
      } else if (channelMessages.length > 0) {
        // Never read this channel — all messages are unread
        unreadCount = channelMessages.length;
      }

      if (unreadCount > 0) {
        const known = channelMap.get(channelId);
        const hubId = known?.hubId ?? '';
        result.push({
          channelId,
          channelName: known?.name ?? `#${channelId.slice(0, 8)}`,
          hubName: hubId ? (hubNameMap.get(hubId) ?? '') : '',
          hubId,
          unreadCount,
        });
      }
    }

    // Sort by unread count descending so noisiest channels appear first
    result.sort((a, b) => b.unreadCount - a.unreadCount);
    return result;
  }, [messages, readStates, dmChannelIds, channelMap, hubNameMap]);

  const totalUnread =
    unreadChannels.reduce((sum, ch) => sum + ch.unreadCount, 0) +
    pendingRequests.length;

  // --- Close on outside click ---
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // --- Navigation handler ---
  const handleChannelClick = useCallback(
    (hubId: string, channelId: string) => {
      if (hubId) useHubStore.getState().setActiveHub(hubId);
      useHubStore.getState().setActiveChannel(channelId);
      setOpen(false);
    },
    [],
  );

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen((p) => !p)}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl text-text-muted hover:bg-white/10 hover:text-accent transition-colors"
        title="Notifications"
      >
        <BellIcon />
        {totalUnread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-magenta px-1 text-[9px] font-bold text-white">
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute left-full top-0 ml-2 z-50 w-72 max-h-96 overflow-y-auto glass-panel rounded-xl p-3"
        >
          <h3 className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/35 mb-2">
            Notifications
          </h3>

          {totalUnread === 0 ? (
            <p className="text-sm text-text-muted py-4 text-center">
              All caught up!
            </p>
          ) : (
            <div className="space-y-1">
              {unreadChannels.map((ch) => (
                <button
                  key={ch.channelId}
                  onClick={() => handleChannelClick(ch.hubId, ch.channelId)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-text-secondary hover:bg-white/5 hover:text-text-primary transition-colors"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    className="shrink-0 text-text-muted"
                  >
                    <path d="M2.5 3.5A1.5 1.5 0 014 2h8a1.5 1.5 0 011.5 1.5v7A1.5 1.5 0 0112 12H5.5L2.5 14.5v-11z" />
                  </svg>
                  <span className="truncate flex-1 text-left">
                    {ch.channelName}
                    {ch.hubName && (
                      <span className="text-text-muted ml-1 text-xs">
                        in {ch.hubName}
                      </span>
                    )}
                  </span>
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-magenta px-1.5 text-[10px] font-bold text-white">
                    {ch.unreadCount > 99 ? '99+' : ch.unreadCount}
                  </span>
                </button>
              ))}

              {pendingRequests.length > 0 && (
                <div className="border-t border-white/5 mt-2 pt-2">
                  <p className="text-xs text-accent px-2 py-1">
                    {pendingRequests.length} pending friend request
                    {pendingRequests.length > 1 ? 's' : ''}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
