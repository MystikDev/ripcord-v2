/**
 * @module user-profile-card
 * Floating profile card shown when clicking a user's name or avatar.
 * Displays avatar, handle, presence, role badges, and action buttons.
 * Portal-rendered at click coordinates with outside-click and Escape dismissal.
 */
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Avatar } from './avatar';
import { useMemberStore } from '../../stores/member-store';
import { usePresenceStore } from '../../stores/presence-store';
import { useAuthStore } from '../../stores/auth-store';
import { useFriendStore } from '../../stores/friend-store';
import { useHubStore } from '../../stores/server-store';
import { createDmChannel, fetchDmChannels } from '../../lib/hub-api';
import { sendFriendRequest, removeFriend, fetchFriends, fetchPendingRequests } from '../../lib/relationship-api';
import { gateway } from '../../lib/gateway-client';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OP_SUBSCRIBE = 4;

const STATUS_LABELS: Record<string, string> = {
  online: 'Online',
  idle: 'Idle',
  dnd: 'Do Not Disturb',
  offline: 'Offline',
};

const STATUS_COLORS: Record<string, string> = {
  online: 'bg-success',
  idle: 'bg-warning',
  dnd: 'bg-danger',
  offline: 'bg-text-muted',
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface UserProfileCardProps {
  userId: string;
  displayName: string;
  /** Position where the card should appear (near the click location). */
  position: { x: number; y: number };
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function UserProfileCard({ userId, displayName, position, onClose }: UserProfileCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  // Member data (avatar, roles, joinedAt)
  const member = useMemberStore((s) => s.members[userId]);
  const avatarUrl = member?.avatarUrl;
  const roles = member?.roles;
  const joinedAt = member?.joinedAt;

  // Presence
  const status = usePresenceStore((s) => s.getStatus(userId));

  // Current user
  const currentUserId = useAuthStore((s) => s.userId);
  const isSelf = userId === currentUserId;

  // Friend state
  const isFriend = useFriendStore((s) => s.isFriend(userId));
  const isPendingIn = useFriendStore((s) => s.isPendingIncoming(userId));
  const isPendingOut = useFriendStore((s) => s.isPendingOutgoing(userId));

  // Position clamping so card stays inside the viewport
  const [adjustedPos, setAdjustedPos] = useState(position);

  useEffect(() => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const newPos = { ...position };
    if (position.x + rect.width > window.innerWidth - 16) {
      newPos.x = position.x - rect.width;
    }
    if (newPos.x < 16) newPos.x = 16;
    if (position.y + rect.height > window.innerHeight - 16) {
      newPos.y = window.innerHeight - rect.height - 16;
    }
    if (newPos.y < 16) newPos.y = 16;
    setAdjustedPos(newPos);
  }, [position]);

  // Close on outside click
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // ----- Actions -----

  const handleSendMessage = useCallback(async () => {
    onClose();
    try {
      const { channelId } = await createDmChannel(userId);
      const dms = await fetchDmChannels();
      useHubStore.getState().setDmChannels(dms);
      gateway.send(OP_SUBSCRIBE, { channelIds: [channelId] });
      useHubStore.getState().setActiveDmChannel(channelId);
    } catch (err) {
      console.error('Failed to open DM:', err);
    }
  }, [userId, onClose]);

  const handleFriendAction = useCallback(async () => {
    if (isFriend) {
      await removeFriend(userId);
      const friends = await fetchFriends();
      useFriendStore.getState().setFriends(
        friends.map((f) => ({ userId: f.userId, handle: f.handle, avatarUrl: f.avatarUrl ?? undefined })),
      );
    } else {
      const res = await sendFriendRequest(userId);
      if (res.ok) {
        const { incoming, outgoing } = await fetchPendingRequests();
        useFriendStore.getState().setPending(
          incoming.map((r) => ({ userId: r.userId, handle: r.handle, avatarUrl: r.avatarUrl ?? undefined, createdAt: r.createdAt })),
          outgoing.map((r) => ({ userId: r.userId, handle: r.handle, avatarUrl: r.avatarUrl ?? undefined, createdAt: r.createdAt })),
        );
        // Also refresh friends in case it was auto-accepted (mutual request)
        const friends = await fetchFriends();
        useFriendStore.getState().setFriends(
          friends.map((f) => ({ userId: f.userId, handle: f.handle, avatarUrl: f.avatarUrl ?? undefined })),
        );
      }
    }
    onClose();
  }, [isFriend, userId, onClose]);

  // Format joined date
  let joinedLabel: string | null = null;
  if (joinedAt) {
    try {
      joinedLabel = new Date(joinedAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      // ignore
    }
  }

  // Determine friend button label
  let friendLabel = 'Add Friend';
  let friendDisabled = false;
  if (isFriend) {
    friendLabel = 'Remove Friend';
  } else if (isPendingIn || isPendingOut) {
    friendLabel = 'Pending...';
    friendDisabled = true;
  }

  return createPortal(
    <div
      ref={cardRef}
      className="fixed z-50 w-64 rounded-xl border border-border bg-surface-1 shadow-2xl overflow-hidden"
      style={{ left: adjustedPos.x, top: adjustedPos.y }}
    >
      {/* Banner area */}
      <div className="h-16 bg-gradient-to-br from-accent/20 via-accent-violet/10 to-transparent" />

      {/* Avatar (overlapping banner) */}
      <div className="px-4 -mt-8">
        <div className="relative inline-block">
          <div className="rounded-full border-4 border-surface-1">
            <Avatar
              src={avatarUrl}
              fallback={displayName}
              size="lg"
              style={{ width: '64px', height: '64px', fontSize: '20px' }}
            />
          </div>
          <div
            className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-[3px] border-surface-1 ${STATUS_COLORS[status] ?? 'bg-text-muted'}`}
          />
        </div>
      </div>

      {/* Info */}
      <div className="px-4 pt-2 pb-4">
        <h3 className="display-text text-base font-semibold text-text-primary truncate">
          {displayName}
        </h3>
        <p className="text-xs text-text-muted flex items-center gap-1.5 mt-0.5">
          <span className={`inline-block w-2 h-2 rounded-full ${STATUS_COLORS[status] ?? 'bg-text-muted'}`} />
          {STATUS_LABELS[status] ?? 'Offline'}
        </p>

        {/* Role badges */}
        {roles && roles.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {roles.map((role) => (
              <span
                key={role.id}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-white/5 text-text-secondary"
              >
                {role.color && (
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ backgroundColor: role.color }}
                  />
                )}
                {role.name}
              </span>
            ))}
          </div>
        )}

        {/* Member since */}
        {joinedLabel && (
          <p className="text-[10px] text-text-muted mt-2">
            Member since {joinedLabel}
          </p>
        )}

        {/* Divider */}
        <div className="my-3 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

        {/* Actions */}
        {!isSelf && (
          <div className="flex gap-2">
            <button
              onClick={() => { void handleSendMessage(); }}
              className="flex-1 rounded-lg bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/20 transition-colors"
            >
              Message
            </button>
            <button
              onClick={friendDisabled ? undefined : () => { void handleFriendAction(); }}
              disabled={friendDisabled}
              className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                isFriend
                  ? 'bg-danger/10 text-danger hover:bg-danger/20'
                  : 'bg-white/5 text-text-secondary hover:bg-white/10 hover:text-text-primary'
              }`}
            >
              {friendLabel}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
