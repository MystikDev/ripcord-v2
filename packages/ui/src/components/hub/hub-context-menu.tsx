/**
 * @module hub-context-menu
 * Right-click context menu for hub icons in the server sidebar.
 * Portal-rendered at click coordinates with outside-click and Escape dismissal.
 * Supports "Leave Hub" (with confirmation) and "Copy Hub ID".
 */
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useHubStore } from '../../stores/server-store';
import { leaveHub } from '../../lib/hub-api';
import { useToast } from '../ui/toast';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HubContextMenuProps {
  hubId: string;
  hubName: string;
  isOwner: boolean;
  position: { x: number; y: number };
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MENU_WIDTH = 200;

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

const LeaveIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3M11 11l3-3-3-3M14 8H6" />
  </svg>
);

const CopyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="5" width="9" height="9" rx="1" />
    <path d="M2 11V3a1 1 0 011-1h8" />
  </svg>
);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HubContextMenu({
  hubId,
  hubName,
  isOwner,
  position,
  onClose,
}: HubContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const handleLeaveHub = useCallback(async () => {
    if (!confirmLeave) {
      setConfirmLeave(true);
      return;
    }

    setLeaving(true);
    try {
      await leaveHub(hubId);

      // Remove hub from store and switch to next available hub
      const state = useHubStore.getState();
      const remaining = state.hubs.filter((h) => h.id !== hubId);
      state.setHubs(remaining);

      if (state.activeHubId === hubId) {
        if (remaining.length > 0) {
          state.setActiveHub(remaining[0]!.id);
        } else {
          state.enterDmView();
        }
      }

      toast.success(`Left ${hubName}`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to leave hub');
      setConfirmLeave(false);
      setLeaving(false);
    }
  }, [hubId, hubName, confirmLeave, onClose, toast]);

  const handleCopyId = useCallback(() => {
    navigator.clipboard.writeText(hubId);
    toast.success('Hub ID copied');
    onClose();
  }, [hubId, onClose, toast]);

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

  // Estimate menu height for viewport clamping
  const estimatedHeight = confirmLeave ? 120 : 100;

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
        {hubName}
      </p>
      <div className="mx-2 mb-1 border-t border-border" />

      {/* Copy Hub ID */}
      <button
        onClick={handleCopyId}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface-3 hover:text-text-primary"
      >
        <span className="shrink-0 text-text-muted"><CopyIcon /></span>
        Copy Hub ID
      </button>

      <div className="mx-2 my-1 border-t border-border" />

      {/* Leave Hub */}
      {confirmLeave ? (
        <div className="px-3 py-2">
          <p className="mb-2 text-xs text-text-muted">
            Leave <strong className="text-text-primary">{hubName}</strong>?
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleLeaveHub}
              disabled={leaving}
              className="flex-1 rounded-md bg-danger px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-danger/80 disabled:opacity-50"
            >
              {leaving ? 'Leaving…' : 'Leave'}
            </button>
            <button
              onClick={() => setConfirmLeave(false)}
              disabled={leaving}
              className="flex-1 rounded-md bg-surface-3 px-2 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-2"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={handleLeaveHub}
          disabled={isOwner}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-danger transition-colors hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-40"
          title={isOwner ? 'Hub owner cannot leave' : undefined}
        >
          <span className="shrink-0"><LeaveIcon /></span>
          Leave Hub
        </button>
      )}
    </div>,
    document.body,
  );
}
