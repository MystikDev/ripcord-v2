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
import { createDmChannel, fetchDmChannels } from '../../lib/hub-api';
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
            className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface-3 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
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
