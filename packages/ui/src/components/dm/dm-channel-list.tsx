/**
 * @module dm-channel-list
 * Renders the list of DM conversations when the user is on the home screen.
 * Shows the other participant's handle and avatar for each DM.
 */
'use client';

import { useHubStore, type DmChannel } from '../../stores/server-store';
import { useAuthStore } from '../../stores/auth-store';
import { usePresenceStore, type PresenceStatus } from '../../stores/presence-store';
import { Avatar } from '../ui/avatar';
import { getUserAvatarUrl } from '../../lib/user-api';
import clsx from 'clsx';

// ---------------------------------------------------------------------------
// Presence dot
// ---------------------------------------------------------------------------

const STATUS_COLOR: Record<PresenceStatus, string> = {
  online: 'bg-emerald-400',
  idle: 'bg-amber-400',
  dnd: 'bg-red-400',
  offline: 'bg-gray-500',
};

function PresenceDot({ userId }: { userId: string }) {
  const status = usePresenceStore((s) => s.getStatus(userId));
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
// DM Row
// ---------------------------------------------------------------------------

function DmRow({ dm }: { dm: DmChannel }) {
  const currentUserId = useAuthStore((s) => s.userId);
  const activeDmChannelId = useHubStore((s) => s.activeDmChannelId);
  const setActiveDmChannel = useHubStore((s) => s.setActiveDmChannel);

  // Find the other participant (not the current user)
  const other = dm.participants.find((p) => p.userId !== currentUserId) ?? dm.participants[0];
  if (!other) return null;

  const isActive = dm.channelId === activeDmChannelId;

  return (
    <button
      onClick={() => setActiveDmChannel(dm.channelId)}
      className={clsx(
        'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors',
        isActive
          ? 'bg-surface-3 text-text-primary'
          : 'text-text-muted hover:bg-surface-2 hover:text-text-secondary',
      )}
    >
      <div className="relative shrink-0">
        <Avatar
          src={other.avatarUrl ? getUserAvatarUrl(other.userId) : undefined}
          fallback={other.handle}
          size="sm"
          style={{ width: 'var(--icon-size-base, 32px)', height: 'var(--icon-size-base, 32px)', fontSize: 'calc(var(--icon-size-base, 32px) * 0.35)' }}
        />
        <PresenceDot userId={other.userId} />
      </div>
      <span className="truncate font-medium" style={{ fontSize: 'var(--font-size-sm, 12px)', color: 'var(--color-username, var(--color-text-primary))' }}>{other.handle}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DmChannelList() {
  const dmChannels = useHubStore((s) => s.dmChannels);

  return (
    <div className="p-2">
      <div className="mb-1 px-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Direct Messages
        </p>
      </div>

      {dmChannels.length === 0 ? (
        <p className="px-2 py-4 text-center text-sm text-text-muted">
          No conversations yet
        </p>
      ) : (
        <div className="flex flex-col gap-0.5">
          {dmChannels.map((dm) => (
            <DmRow key={dm.channelId} dm={dm} />
          ))}
        </div>
      )}
    </div>
  );
}
