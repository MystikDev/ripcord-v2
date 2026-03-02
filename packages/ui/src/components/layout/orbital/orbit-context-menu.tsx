/**
 * @module orbit-context-menu
 * Portal-rendered right-click context menu for orbit zones in the orbital
 * view. Provides admin actions: open Solar System Settings, rename orbit,
 * and delete orbit. Gated by permissions.
 */
'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { deleteChannel, renameChannel } from '../../../lib/hub-api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrbitContextMenuProps {
  channelId: string;
  channelName: string;
  hubId: string;
  position: { x: number; y: number };
  onClose: () => void;
  canManageChannels: boolean;
  canManageHub: boolean;
  onOpenSettings: () => void;
  onChannelDeleted: (channelId: string) => void;
  onChannelRenamed: (channelId: string, newName: string) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MENU_WIDTH = 200;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OrbitContextMenu({
  channelId,
  channelName,
  hubId,
  position,
  onClose,
  canManageChannels,
  canManageHub,
  onOpenSettings,
  onChannelDeleted,
  onChannelRenamed,
}: OrbitContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(channelName);
  const [renameSaving, setRenameSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  // Viewport clamping
  const menuHeight = 160;
  const x = Math.min(position.x, window.innerWidth - MENU_WIDTH - 8);
  const y = Math.min(position.y, window.innerHeight - menuHeight - 8);

  const handleRename = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === channelName) {
      setRenaming(false);
      return;
    }
    setRenameSaving(true);
    try {
      await renameChannel(hubId, channelId, trimmed);
      onChannelRenamed(channelId, trimmed);
      onClose();
    } catch {
      // eslint-disable-next-line no-console
      console.error('[OrbitContextMenu] Failed to rename channel');
    } finally {
      setRenameSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteChannel(hubId, channelId);
      onChannelDeleted(channelId);
      onClose();
    } catch {
      // eslint-disable-next-line no-console
      console.error('[OrbitContextMenu] Failed to delete channel');
    } finally {
      setDeleting(false);
    }
  };

  const hasAnyAction = canManageHub || canManageChannels;
  if (!hasAnyAction) return null;

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-50 rounded-lg border border-border bg-surface-2 p-1.5 shadow-lg"
      style={{ left: x, top: y, width: MENU_WIDTH }}
    >
      {/* Solar System Settings */}
      {canManageHub && (
        <button
          type="button"
          onClick={() => {
            onOpenSettings();
          }}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[11px] text-text-secondary transition-colors hover:bg-surface-3 hover:text-text-primary cursor-pointer"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <circle cx="8" cy="8" r="3" />
            <path d="M6.5 1.2h3l.4 2 1.3.7 1.8-.9 2.1 2.1-.9 1.8.7 1.3 2 .4v3l-2 .4-.7 1.3.9 1.8-2.1 2.1-1.8-.9-1.3.7-.4 2h-3l-.4-2-1.3-.7-1.8.9L.9 12.9l.9-1.8-.7-1.3-2-.4v-3l2-.4.7-1.3L.9 3.1 3 1l1.8.9 1.3-.7z" />
          </svg>
          Solar System Settings
        </button>
      )}

      {/* Divider */}
      {canManageHub && canManageChannels && (
        <div className="mx-1.5 my-1 border-t border-border" />
      )}

      {/* Rename Orbit */}
      {canManageChannels && !renaming && (
        <button
          type="button"
          onClick={() => setRenaming(true)}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[11px] text-text-secondary transition-colors hover:bg-surface-3 hover:text-text-primary cursor-pointer"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <path d="M11 1.5l3.5 3.5L5 14.5H1.5V11z" />
          </svg>
          Rename Orbit
        </button>
      )}

      {/* Inline rename form */}
      {canManageChannels && renaming && (
        <form onSubmit={handleRename} className="px-1.5 py-1">
          <input
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            className="w-full rounded-md border border-border bg-surface-1 px-2 py-1 text-[11px] text-text-primary outline-none focus:border-accent"
            autoFocus
            disabled={renameSaving}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setRenaming(false);
                setRenameValue(channelName);
              }
            }}
          />
        </form>
      )}

      {/* Delete Orbit */}
      {canManageChannels && !confirmDelete && (
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[11px] text-red-400 transition-colors hover:bg-red-500/10 cursor-pointer"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <path d="M2 4h12M5.5 4V2.5h5V4M6 7v5M10 7v5M3.5 4l.5 10h8l.5-10" />
          </svg>
          Delete Orbit
        </button>
      )}

      {/* Delete confirmation */}
      {canManageChannels && confirmDelete && (
        <div className="flex items-center gap-1.5 px-1.5 py-1">
          <span className="text-[10px] text-red-400">Delete?</span>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-md bg-red-500/15 px-2 py-0.5 text-[10px] text-red-400 transition-colors hover:bg-red-500/25 cursor-pointer"
          >
            {deleting ? '...' : 'Yes'}
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            className="rounded-md px-2 py-0.5 text-[10px] text-text-muted transition-colors hover:bg-surface-3 cursor-pointer"
          >
            No
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}
