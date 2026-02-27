/**
 * @module user-context-menu
 * Generic right-click context menu for user interactions. Portal-rendered at
 * click coordinates with outside-click and Escape dismissal. Built for future
 * extensibility via the `extraItems` prop.
 */
'use client';

import { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useHubStore } from '../../stores/server-store';
import { useFriendStore } from '../../stores/friend-store';
import { createDmChannel, fetchDmChannels } from '../../lib/hub-api';
import { sendFriendRequest, removeFriend, blockUser, fetchFriends, fetchPendingRequests } from '../../lib/relationship-api';
import { gateway } from '../../lib/gateway-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  /** Visual separator above this item */
  separator?: boolean;
  /** Extra Tailwind classes appended to the button */
  className?: string;
}

export interface UserContextMenuProps {
  userId: string;
  displayName: string;
  position: { x: number; y: number };
  onClose: () => void;
  /** Additional menu items injected by the parent */
  extraItems?: ContextMenuItem[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MENU_WIDTH = 200;
const MENU_ITEM_HEIGHT = 32;
const MENU_PADDING = 8;
const OP_SUBSCRIBE = 4;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function UserContextMenu({
  userId,
  displayName,
  position,
  onClose,
  extraItems,
}: UserContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const isFriend = useFriendStore((s) => s.isFriend(userId));
  const isPendingIn = useFriendStore((s) => s.isPendingIncoming(userId));
  const isPendingOut = useFriendStore((s) => s.isPendingOutgoing(userId));

  const handleDirectMessage = useCallback(async () => {
    onClose();
    try {
      const { channelId } = await createDmChannel(userId);

      // Refresh DM list in store
      const dms = await fetchDmChannels();
      useHubStore.getState().setDmChannels(dms);

      // Subscribe to the DM channel via gateway
      gateway.send(OP_SUBSCRIBE, { channelIds: [channelId] });

      // Navigate to DM view with this channel selected
      useHubStore.getState().setActiveDmChannel(channelId);
    } catch (err) {
      console.error('Failed to open DM:', err);
    }
  }, [userId, onClose]);

  const handleAddFriend = async () => {
    const res = await sendFriendRequest(userId);
    if (res.ok) {
      // Refresh pending requests
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
    onClose();
  };

  const handleRemoveFriend = async () => {
    await removeFriend(userId);
    const friends = await fetchFriends();
    useFriendStore.getState().setFriends(
      friends.map((f) => ({ userId: f.userId, handle: f.handle, avatarUrl: f.avatarUrl ?? undefined })),
    );
    onClose();
  };

  const handleBlock = async () => {
    await blockUser(userId);
    // Refresh all relationship data
    const friends = await fetchFriends();
    useFriendStore.getState().setFriends(
      friends.map((f) => ({ userId: f.userId, handle: f.handle, avatarUrl: f.avatarUrl ?? undefined })),
    );
    onClose();
  };

  // Default menu items
  const defaultItems: ContextMenuItem[] = [
    {
      label: 'Direct Message',
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 14c3.866 0 7-2.686 7-6s-3.134-6-7-6-7 2.686-7 6c0 1.278.44 2.462 1.194 3.434L1.5 14.5l3.21-.92A7.576 7.576 0 008 14z" />
        </svg>
      ),
      onClick: () => { void handleDirectMessage(); },
    },
    // Friend action (conditional)
    ...(isFriend
      ? [{
          label: 'Remove Friend',
          className: 'hover:!text-red-400',
          icon: (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 4a3 3 0 11-6 0 3 3 0 016 0zM1 13c0-2.21 2.239-4 5-4s5 1.79 5 4" />
              <path d="M12 7h4" />
            </svg>
          ),
          onClick: () => { void handleRemoveFriend(); },
        }]
      : isPendingIn || isPendingOut
        ? [{
            label: 'Pending...',
            icon: (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 4a3 3 0 11-6 0 3 3 0 016 0zM1 13c0-2.21 2.239-4 5-4s5 1.79 5 4" />
                <circle cx="13" cy="8" r="3" />
                <path d="M13 6.5v1.5h1.5" />
              </svg>
            ),
            onClick: () => {},
            disabled: true,
          }]
        : [{
            label: 'Add Friend',
            icon: (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 4a3 3 0 11-6 0 3 3 0 016 0zM1 13c0-2.21 2.239-4 5-4s5 1.79 5 4" />
                <path d="M13 6v4M11 8h4" />
              </svg>
            ),
            onClick: () => { void handleAddFriend(); },
          }]
    ) as ContextMenuItem[],
    // Block user
    {
      label: 'Block User',
      className: 'hover:!text-red-400',
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="8" cy="8" r="6" />
          <path d="M3.75 3.75l8.5 8.5" />
        </svg>
      ),
      onClick: () => { void handleBlock(); },
    },
    {
      label: 'Copy User ID',
      separator: true,
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="5" width="9" height="9" rx="1" />
          <path d="M2 11V3a1 1 0 011-1h8" />
        </svg>
      ),
      onClick: () => {
        navigator.clipboard.writeText(userId);
        onClose();
      },
    },
  ];

  const allItems = [...(extraItems ?? []), ...defaultItems];

  // Estimate menu height for viewport clamping
  const estimatedHeight =
    allItems.length * MENU_ITEM_HEIGHT + MENU_PADDING * 2 + 28; // header

  // Close on outside click
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Clamp position so menu doesn't overflow viewport
  const x = Math.min(position.x, window.innerWidth - MENU_WIDTH - 8);
  const y = Math.min(position.y, window.innerHeight - estimatedHeight - 8);

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-50 rounded-lg border border-border bg-surface-2 py-1 shadow-lg"
      style={{ left: x, top: y, width: MENU_WIDTH }}
    >
      {/* Header */}
      <p className="truncate px-3 py-1.5 text-xs font-medium text-text-primary">
        {displayName}
      </p>
      <div className="mx-2 mb-1 border-t border-border" />

      {/* Menu items */}
      {allItems.map((item, i) => (
        <div key={i}>
          {item.separator && i > 0 && (
            <div className="mx-2 my-1 border-t border-border" />
          )}
          <button
            onClick={item.disabled ? undefined : item.onClick}
            disabled={item.disabled}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface-3 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40${item.className ? ` ${item.className}` : ''}`}
          >
            {item.icon && (
              <span className="shrink-0 text-text-muted">{item.icon}</span>
            )}
            {item.label}
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
