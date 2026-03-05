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
  sendFriendRequestByHandle,
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
  online: 'bg-[#34d399]',
  idle: 'bg-[#fbbf24]',
  dnd: 'bg-[#f87171]',
  offline: 'bg-[#5c657a]',
};

// ---------------------------------------------------------------------------
// Status dot
// ---------------------------------------------------------------------------

function StatusDot({ status }: { status: PresenceStatus }) {
  return (
    <span
      className={clsx(
        'absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#0a0a0f]',
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
    if (!window.confirm("Remove this friend? You'll need to send a new request to reconnect.")) return;
    const { ok } = await removeFriend(userId);
    if (ok) await refreshFriends();
  }, [userId]);

  return (
    <div
      className={clsx(
        'flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200',
        'border border-transparent hover:bg-white/5 hover:border-white/8',
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
          'min-w-0 flex-1 truncate font-mono text-[12px]',
          offline ? 'text-text-muted' : 'text-text-primary',
        )}
      >
        {handle}
      </span>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          onClick={handleDm}
          className="rounded-lg border border-white/8 bg-white/5 px-3.5 py-1.5 font-mono text-[10px] text-text-secondary transition-all duration-150 hover:border-accent/30 hover:bg-accent/10 hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
        >
          DM
        </button>
        <button
          onClick={handleRemove}
          className="rounded-lg border border-white/8 bg-white/5 px-3.5 py-1.5 font-mono text-[10px] text-text-secondary transition-all duration-150 hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400 focus:outline-none focus:ring-2 focus:ring-accent/40"
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
    <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200 border border-transparent hover:bg-white/5 hover:border-white/8">
      <div className="shrink-0">
        <Avatar src={avatarUrl} fallback={handle} size="sm" />
      </div>

      <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-text-primary">
        {handle}
      </span>

      <div className="flex shrink-0 items-center gap-1.5">
        {direction === 'incoming' ? (
          <>
            <button
              onClick={handleAccept}
              className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1.5 font-mono text-[10px] text-emerald-400 transition-all duration-150 hover:bg-emerald-500/20 hover:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-accent/40"
            >
              Accept
            </button>
            <button
              onClick={handleDecline}
              className="rounded-lg border border-white/8 bg-white/5 px-3.5 py-1.5 font-mono text-[10px] text-text-secondary transition-all duration-150 hover:border-white/15 hover:bg-white/8 hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
            >
              Decline
            </button>
          </>
        ) : (
          <button
            onClick={handleCancel}
            className="rounded-lg border border-white/8 bg-white/5 px-3.5 py-1.5 font-mono text-[10px] text-text-secondary transition-all duration-150 hover:border-white/15 hover:bg-white/8 hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
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
    if (!window.confirm("Unblock this user? They'll be able to message you again.")) return;
    const { ok } = await unblockUser(userId);
    if (ok) await refreshBlocked();
  }, [userId]);

  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200 border border-transparent hover:bg-white/5 hover:border-white/8">
      <div className="shrink-0">
        <Avatar fallback={handle} size="sm" />
      </div>

      <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-text-primary">
        {handle}
      </span>

      <button
        onClick={handleUnblock}
        className="shrink-0 rounded-lg border border-white/8 bg-white/5 px-3.5 py-1.5 font-mono text-[10px] text-text-secondary transition-all duration-150 hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400 focus:outline-none focus:ring-2 focus:ring-accent/40"
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
    <div className="flex h-12 items-center gap-1 border-b border-white/5 px-3">
      {TABS.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={clsx(
            'relative px-3 py-2 font-mono text-[11px] uppercase tracking-[0.08em] transition-all duration-150 cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent/40',
            active === key
              ? 'text-accent'
              : 'text-text-muted hover:text-text-secondary',
          )}
        >
          {label}
          <span className={clsx(
            'ml-1.5 font-mono text-[11px]',
            active === key ? 'text-accent/70' : 'text-text-muted/70',
          )}>
            {counts[key]}
          </span>
          {active === key && (
            <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4/5 h-[2px] rounded-full bg-accent" />
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
      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/35">
        {label} — {count}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add Friend bar
// ---------------------------------------------------------------------------

function AddFriendBar() {
  const [handle, setHandle] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = handle.trim();
    if (!trimmed) return;

    setStatus('sending');
    setErrorMsg('');
    const res = await sendFriendRequestByHandle(trimmed);
    if (res.ok) {
      setStatus('success');
      setHandle('');
      // Refresh pending list
      const { incoming, outgoing } = await fetchPendingRequests();
      useFriendStore.getState().setPending(
        incoming.map((r) => ({ userId: r.userId, handle: r.handle, avatarUrl: r.avatarUrl ?? undefined, createdAt: r.createdAt })),
        outgoing.map((r) => ({ userId: r.userId, handle: r.handle, avatarUrl: r.avatarUrl ?? undefined, createdAt: r.createdAt })),
      );
      // Also refresh friends in case auto-accepted (mutual request)
      const friends = await fetchFriends();
      useFriendStore.getState().setFriends(
        friends.map((f) => ({ userId: f.userId, handle: f.handle, avatarUrl: f.avatarUrl ?? undefined })),
      );
      setTimeout(() => setStatus('idle'), 2000);
    } else {
      setStatus('error');
      setErrorMsg(res.error ?? 'Failed to send request');
      setTimeout(() => setStatus('idle'), 3000);
    }
  }, [handle]);

  return (
    <form
      onSubmit={handleSubmit}
      className="relative flex items-center gap-2 px-3 py-2.5 border-b border-white/5"
    >
      <input
        type="text"
        value={handle}
        onChange={(e) => { setHandle(e.target.value); if (status !== 'idle') setStatus('idle'); }}
        placeholder="Enter a username..."
        className={clsx(
          'flex-1 min-w-0 bg-white/5 border rounded-lg px-3 py-1.5',
          'font-mono text-[12px] text-text-primary placeholder:text-text-muted/50',
          'focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/30',
          'transition-all duration-150',
          status === 'error' ? 'border-red-500/30' : 'border-white/8',
        )}
      />
      <button
        type="submit"
        disabled={!handle.trim() || status === 'sending'}
        className={clsx(
          'shrink-0 flex items-center gap-1.5 rounded-lg px-3.5 py-1.5',
          'font-mono text-[10px] transition-all duration-150',
          'focus:outline-none focus:ring-2 focus:ring-accent/40',
          status === 'success'
            ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
            : status === 'error'
              ? 'border border-red-500/30 bg-red-500/10 text-red-400'
              : 'border border-accent/30 bg-accent/10 text-accent hover:bg-accent/20 hover:border-accent/50 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed',
        )}
      >
        {status === 'success' ? (
          <>
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="2 6 5 9 10 3" />
            </svg>
            Sent!
          </>
        ) : status === 'sending' ? (
          'Sending...'
        ) : (
          <>
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <line x1="6" y1="2" x2="6" y2="10" />
              <line x1="2" y1="6" x2="10" y2="6" />
            </svg>
            Add Friend
          </>
        )}
      </button>
      {status === 'error' && errorMsg && (
        <span className="absolute top-full left-3 mt-0.5 font-mono text-[9px] text-red-400">
          {errorMsg}
        </span>
      )}
    </form>
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
              <p className="px-2 pt-8 text-center font-mono text-[11px] text-text-muted">
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
              <p className="px-2 pt-8 text-center font-mono text-[11px] text-text-muted">
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
              <p className="px-2 pt-8 text-center font-mono text-[11px] text-text-muted">
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
              <p className="px-2 pt-8 text-center font-mono text-[11px] text-text-muted">
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
    <div className="flex h-full flex-1 flex-col bg-surface-1/80 backdrop-blur-sm">
      <AddFriendBar />
      <TabBar active={activeTab} counts={counts} onChange={setActiveTab} />
      <ScrollArea className="flex-1">
        {renderContent()}
      </ScrollArea>
    </div>
  );
}
