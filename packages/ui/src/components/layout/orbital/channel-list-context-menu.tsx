/**
 * @module channel-list-context-menu
 * Portal-rendered right-click context menu for channels in the orbital channel
 * list sidebar. Provides Rename and Delete actions, gated by permissions.
 * Follows the same pattern as orbit-context-menu.tsx.
 */
'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { deleteChannel, renameChannel } from '../../../lib/hub-api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChannelListContextMenuProps {
  channelId: string;
  channelName: string;
  channelType: 'text' | 'voice';
  hubId: string;
  position: { x: number; y: number };
  onClose: () => void;
  canManageChannels: boolean;
  onChannelDeleted: (channelId: string) => void;
  onChannelRenamed: (channelId: string, newName: string) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MENU_WIDTH = 180;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChannelListContextMenu({
  channelId,
  channelName,
  channelType,
  hubId,
  position,
  onClose,
  canManageChannels,
  onChannelDeleted,
  onChannelRenamed,
}: ChannelListContextMenuProps) {
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
  const menuHeight = 120;
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
      console.error('[ChannelListContextMenu] Failed to rename channel');
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
      console.error('[ChannelListContextMenu] Failed to delete channel');
    } finally {
      setDeleting(false);
    }
  };

  if (!canManageChannels) return null;

  const typeLabel = channelType === 'voice' ? 'Orbit' : 'Channel';

  return createPortal(
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        zIndex: 500,
        left: x,
        top: y,
        width: MENU_WIDTH,
        background: 'rgba(7, 9, 13, 0.98)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 8,
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        padding: '4px 0',
        boxShadow: '0 10px 30px -5px rgba(0, 0, 0, 0.5)',
      }}
    >
      {/* Rename */}
      {!renaming && (
        <button
          type="button"
          onClick={() => setRenaming(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            padding: '6px 12px',
            border: 'none',
            background: 'transparent',
            color: 'rgba(255, 255, 255, 0.7)',
            fontSize: 11,
            fontFamily: 'var(--font-mono, monospace)',
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'background 0.1s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 1.5l3.5 3.5L5 14.5H1.5V11z" />
          </svg>
          Rename {typeLabel}
        </button>
      )}

      {/* Inline rename form */}
      {renaming && (
        <form onSubmit={handleRename} style={{ padding: '4px 8px' }}>
          <input
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            style={{
              width: '100%',
              padding: '4px 8px',
              borderRadius: 4,
              border: '1px solid rgba(255, 255, 255, 0.15)',
              background: 'rgba(255, 255, 255, 0.05)',
              color: 'rgba(255, 255, 255, 0.9)',
              fontSize: 11,
              fontFamily: 'var(--font-mono, monospace)',
              outline: 'none',
            }}
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

      {/* Delete */}
      {!confirmDelete && (
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            padding: '6px 12px',
            border: 'none',
            background: 'transparent',
            color: '#f87171',
            fontSize: 11,
            fontFamily: 'var(--font-mono, monospace)',
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'background 0.1s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(248, 113, 113, 0.08)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 4h12M5.5 4V2.5h5V4M6 7v5M10 7v5M3.5 4l.5 10h8l.5-10" />
          </svg>
          Delete {typeLabel}
        </button>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px' }}>
          <span style={{ fontSize: 10, color: '#f87171', fontFamily: 'var(--font-mono, monospace)' }}>Delete?</span>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            style={{
              padding: '2px 8px',
              borderRadius: 4,
              border: 'none',
              background: 'rgba(248, 113, 113, 0.15)',
              color: '#f87171',
              fontSize: 10,
              fontFamily: 'var(--font-mono, monospace)',
              cursor: 'pointer',
            }}
          >
            {deleting ? '...' : 'Yes'}
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            style={{
              padding: '2px 8px',
              borderRadius: 4,
              border: 'none',
              background: 'transparent',
              color: 'rgba(255, 255, 255, 0.4)',
              fontSize: 10,
              fontFamily: 'var(--font-mono, monospace)',
              cursor: 'pointer',
            }}
          >
            No
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}
