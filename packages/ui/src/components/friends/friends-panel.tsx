'use client';

/**
 * @module friends-panel
 * Friends list panel with Online / All / Pending / Blocked tabs.
 * Shows friend rows with presence indicators and action buttons.
 */

import { useMemo, useState, useCallback } from 'react';
import clsx from 'clsx';
import { useFriendStore } from '../../stores/friend-store';
import { usePresenceStore, type PresenceStatus } from '../../stores/presence-store';
import { useHubStore } from '../../stores/server-store';
import { Avatar } from '../ui/avatar';
import { ScrollArea } from '../ui/scroll-area';
import {
  acceptFriendRequest,
  declineFriendRequest,
  removeFriend,
  unblockUser,
  fetchFriends,
  fetchPendingRequests,
  fetchBlockedUsers,
} from '../../lib/relationship-api';
import { createDmChannel } from '../../lib/hub-api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab = 'online' | 'all' | 'pending' | 'blocked';

// ---------------------------------------------------------------------------
// Presence helpers
// ---------------------------------------------------------------------------

const PRESENCE_WEIGHT: Record<PresenceStatus, number> = {
  online: 0,
  idle: 1,
  dnd: 2,
  offline: 3,
};

const STATUS_COLOR: Record<PresenceStatus, string> = {
  online: 'bg-emerald-400',
  idle: 'bg-amber-400',
  dnd: 'bg-red-400',
  offline: 'bg-gray-500',
};

// ---------------------------------------------------------------------------
// Status dot
// ---------------------------------------------------------------------------

function StatusDot({ status }: { status: PresenceStatus }) {
  return (
    <span
      className={clsx(
        'absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-surface-1',
        STATUS_COLOR[status],
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// Refresh helpers
// ---------------------------------------------------------------------------

const refreshFriends = async () => {
  const friends = await fetchFriends();
  useFriendStore.getState().setFriends(
    friends.map((f) => ({
      userId: f.userId,
      handle: f.handle,
      avatarUrl: f.avatarUrl ?? undefined,
    })),
  );
};

const refreshPending = async () => {
  const { incoming, outgoing } = await fetchPendingRequests();
  useFriendStore.getState().setPending(
    incoming.map((r) => ({
      userId: r.userId,
      handle: r.handle,
      avatarUrl: r.avatarUrl ?? undefined,
      createdAt: r.createdAt,
    })),
    outgoing.map((r) => ({
      userId: r.userId,
      handle: r.handle,
      avatarUrl: r.avatarUrl ?? undefined,
      createdAt: r.createdAt,
    })),
  );
};

const refreshBlocked = async () => {
  const blocked = await fetchBlockedUsers();
  useFriendStore.getState().setBlocked(
    blocked.map((b) => ({ userId: b.userId, handle: b.handle })),
  );
};

// ---------------------------------------------------------------------------
// Friend row (Online / All tabs)
// ---------------------------------------------------------------------------

function FriendRow({
  userId,
  handle,
  avatarUrl,
  offline,
}: {
  userId: string;
  handle: string;
  avatarUrl?: string;
  offline?: boolean;
}) {
  const status = usePresenceStore((s) => s.getStatus(userId));

  const handleDm = useCallback(async () => {
    try {
      const { channelId } = await createDmChannel(userId);
      useHubStore.getState().setActiveDmChannel(channelId);
    } catch {
      // silently fail — DM creation might error if user is blocked, etc.
    }
  }, [userId]);

  const handleRemove = useCallback(async () => {
    const { ok } = await removeFriend(userId);
    if (ok) await refreshFriends();
  }, [userId]);

  return (
    <div
      className={clsx(
        'flex items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-surface-2',
        offline && 'opacity-40',
      )}
    >
      {/* Avatar + status dot */}
      <div className="relative shrink-0">
        <Avatar src={avatarUrl} fallback={handle} size="sm" />
        <StatusDot status={status} />
      </div>

      {/* Handle */}
      <span
        className={clsx(
          'min-w-0 flex-1 truncate text-sm font-medium',
          offline ? 'text-text-muted' : 'text-text-primary',
        )}
      >
        {handle}
      </span>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          onClick={handleDm}
          className="rounded bg-surface-3 px-3 py-1 text-xs text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
        >
          DM
        </button>
        <button
          onClick={handleRemove}
          className="rounded bg-surface-3 px-3 py-1 text-xs text-text-secondary transition-colors hover:bg-red-500/20 hover:text-red-400"
        >
          Remove
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pending request row
// ---------------------------------------------------------------------------

function PendingRow({
  userId,
  handle,
  avatarUrl,
  direction,
}: {
  userId: string;
  handle: string;
  avatarUrl?: string;
  direction: 'incoming' | 'outgoing';
}) {
  const handleAccept = useCallback(async () => {
    const { ok } = await acceptFriendRequest(userId);
    if (ok) {
      await refreshFriends();
      await refreshPending();
    }
  }, [userId]);

  const handleDecline = useCallback(async () => {
    const { ok } = await declineFriendRequest(userId);
    if (ok) await refreshPending();
  }, [userId]);

  const handleCancel = useCallback(async () => {
    const { ok } = await declineFriendRequest(userId);
    if (ok) await refreshPending();
  }, [userId]);

  return (
    <div className="flex items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-surface-2">
      <div className="shrink-0">
        <Avatar src={avatarUrl} fallback={handle} size="sm" />
      </div>

      <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
        {handle}
      </span>

      <div className="flex shrink-0 items-center gap-1.5">
        {direction === 'incoming' ? (
          <>
            <button
              onClick={handleAccept}
              className="rounded bg-emerald-600 px-3 py-1 text-xs text-white transition-colors hover:bg-emerald-500"
            >
              Accept
            </button>
            <button
              onClick={handleDecline}
              className="rounded bg-surface-3 px-3 py-1 text-xs text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
            >
              Decline
            </button>
          </>
        ) : (
          <button
            onClick={handleCancel}
            className="rounded bg-surface-3 px-3 py-1 text-xs text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Blocked user row
// ---------------------------------------------------------------------------

function BlockedRow({
  userId,
  handle,
}: {
  userId: string;
  handle: string;
}) {
  const handleUnblock = useCallback(async () => {
    const { ok } = await unblockUser(userId);
    if (ok) await refreshBlocked();
  }, [userId]);

  return (
    <div className="flex items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-surface-2">
      <div className="shrink-0">
        <Avatar fallback={handle} size="sm" />
      </div>

      <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
        {handle}
      </span>

      <button
        onClick={handleUnblock}
        className="shrink-0 rounded bg-surface-3 px-3 py-1 text-xs text-text-secondary transition-colors hover:bg-red-500/20 hover:text-red-400"
      >
        Unblock
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab bar
// ---------------------------------------------------------------------------

const TABS: { key: Tab; label: string }[] = [
  { key: 'online', label: 'Online' },
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'blocked', label: 'Blocked' },
];

function TabBar({
  active,
  counts,
  onChange,
}: {
  active: Tab;
  counts: Record<Tab, number>;
  onChange: (tab: Tab) => void;
}) {
  return (
    <div className="flex h-12 items-center gap-4 border-b border-border px-4">
      {TABS.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={clsx(
            'relative pb-0.5 text-sm font-medium transition-colors',
            active === key
              ? 'text-text-primary'
              : 'text-text-muted hover:text-text-secondary',
          )}
        >
          {label} — {counts[key]}
          {active === key && (
            <span className="absolute -bottom-[9px] left-0 right-0 h-0.5 rounded-full bg-accent" />
          )}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section header (used in Pending tab)
// ---------------------------------------------------------------------------

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="px-3 pt-4 pb-1">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
        {label} — {count}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function FriendsPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('online');

  const friends = useFriendStore((s) => s.friends);
  const pendingIncoming = useFriendStore((s) => s.pendingIncoming);
  const pendingOutgoing = useFriendStore((s) => s.pendingOutgoing);
  const blocked = useFriendStore((s) => s.blocked);
  const presenceMap = usePresenceStore((s) => s.presence);

  // -----------------------------------------------------------------------
  // Filtering & sorting
  // -----------------------------------------------------------------------

  const onlineFriends = useMemo(() => {
    return friends
      .filter((f) => {
        const status = presenceMap[f.userId] ?? 'offline';
        return status !== 'offline';
      })
      .sort((a, b) => {
        const sa = presenceMap[a.userId] ?? 'offline';
        const sb = presenceMap[b.userId] ?? 'offline';
        const wa = PRESENCE_WEIGHT[sa];
        const wb = PRESENCE_WEIGHT[sb];
        if (wa !== wb) return wa - wb;
        return a.handle.localeCompare(b.handle);
      });
  }, [friends, presenceMap]);

  const allFriends = useMemo(() => {
    return [...friends].sort((a, b) => {
      const sa = presenceMap[a.userId] ?? 'offline';
      const sb = presenceMap[b.userId] ?? 'offline';
      const wa = PRESENCE_WEIGHT[sa];
      const wb = PRESENCE_WEIGHT[sb];
      if (wa !== wb) return wa - wb;
      return a.handle.localeCompare(b.handle);
    });
  }, [friends, presenceMap]);

  // -----------------------------------------------------------------------
  // Tab counts
  // -----------------------------------------------------------------------

  const counts: Record<Tab, number> = useMemo(
    () => ({
      online: onlineFriends.length,
      all: friends.length,
      pending: pendingIncoming.length + pendingOutgoing.length,
      blocked: blocked.length,
    }),
    [onlineFriends.length, friends.length, pendingIncoming.length, pendingOutgoing.length, blocked.length],
  );

  // -----------------------------------------------------------------------
  // Render tab content
  // -----------------------------------------------------------------------

  const renderContent = () => {
    switch (activeTab) {
      case 'online':
        return (
          <div className="p-2">
            {onlineFriends.length === 0 ? (
              <p className="px-2 pt-8 text-center text-sm text-text-muted">
                No friends online
              </p>
            ) : (
              onlineFriends.map((f) => (
                <FriendRow
                  key={f.userId}
                  userId={f.userId}
                  handle={f.handle}
                  avatarUrl={f.avatarUrl}
                />
              ))
            )}
          </div>
        );

      case 'all':
        return (
          <div className="p-2">
            {allFriends.length === 0 ? (
              <p className="px-2 pt-8 text-center text-sm text-text-muted">
                No friends yet
              </p>
            ) : (
              allFriends.map((f) => {
                const status = presenceMap[f.userId] ?? 'offline';
                return (
                  <FriendRow
                    key={f.userId}
                    userId={f.userId}
                    handle={f.handle}
                    avatarUrl={f.avatarUrl}
                    offline={status === 'offline'}
                  />
                );
              })
            )}
          </div>
        );

      case 'pending':
        return (
          <div className="p-2">
            {pendingIncoming.length === 0 && pendingOutgoing.length === 0 ? (
              <p className="px-2 pt-8 text-center text-sm text-text-muted">
                No pending requests
              </p>
            ) : (
              <>
                {pendingIncoming.length > 0 && (
                  <div>
                    <SectionHeader label="Incoming" count={pendingIncoming.length} />
                    {pendingIncoming.map((r) => (
                      <PendingRow
                        key={r.userId}
                        userId={r.userId}
                        handle={r.handle}
                        avatarUrl={r.avatarUrl}
                        direction="incoming"
                      />
                    ))}
                  </div>
                )}
                {pendingOutgoing.length > 0 && (
                  <div>
                    <SectionHeader label="Outgoing" count={pendingOutgoing.length} />
                    {pendingOutgoing.map((r) => (
                      <PendingRow
                        key={r.userId}
                        userId={r.userId}
                        handle={r.handle}
                        avatarUrl={r.avatarUrl}
                        direction="outgoing"
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        );

      case 'blocked':
        return (
          <div className="p-2">
            {blocked.length === 0 ? (
              <p className="px-2 pt-8 text-center text-sm text-text-muted">
                No blocked users
              </p>
            ) : (
              blocked.map((b) => (
                <BlockedRow key={b.userId} userId={b.userId} handle={b.handle} />
              ))
            )}
          </div>
        );
    }
  };

  return (
    <div className="flex h-full flex-1 flex-col bg-surface-1">
      <TabBar active={activeTab} counts={counts} onChange={setActiveTab} />
      <ScrollArea className="flex-1">
        {renderContent()}
      </ScrollArea>
    </div>
  );
}
