/**
 * @module participant-context-menu
 * Right-click context menu for voice channel participants. Provides a per-user
 * volume slider (0-400%) persisted to the settings store and a reset-to-100% button.
 */
'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSettingsStore } from '../../stores/settings-store';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParticipantContextMenuProps {
  userId: string;
  displayName: string;
  position: { x: number; y: number };
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MENU_WIDTH = 220;
const MENU_HEIGHT = 120; // approximate

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ParticipantContextMenu({
  userId,
  displayName,
  position,
  onClose,
}: ParticipantContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const volume = useSettingsStore((s) => s.userVolumes[userId] ?? 1.0);
  const setUserVolume = useSettingsStore((s) => s.setUserVolume);
  const resetUserVolume = useSettingsStore((s) => s.resetUserVolume);

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
  const y = Math.min(position.y, window.innerHeight - MENU_HEIGHT - 8);

  const percentage = Math.round(volume * 100);
  const isDefault = !(userId in useSettingsStore.getState().userVolumes);

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-50 rounded-lg border border-border bg-surface-2 p-3 shadow-lg"
      style={{ left: x, top: y, width: MENU_WIDTH }}
    >
      {/* Header */}
      <p className="mb-2 truncate text-xs font-medium text-text-primary">
        {displayName}
      </p>

      {/* Volume slider */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-text-muted">User Volume</span>
          <span className="text-[11px] font-medium text-text-secondary">
            {percentage}%
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={percentage}
          onChange={(e) => setUserVolume(userId, Number(e.target.value) / 100)}
          className="w-full accent-accent h-1.5 cursor-pointer"
        />
        <div className="flex items-center justify-between">
          <div className="flex justify-between w-full text-[10px] text-text-muted">
            <span>0%</span>
            <span>50%</span>
            <span>100%</span>
          </div>
        </div>
      </div>

      {/* Reset button */}
      {!isDefault && (
        <button
          onClick={() => {
            resetUserVolume(userId);
            onClose();
          }}
          className="mt-2 w-full rounded px-2 py-1 text-[11px] text-text-muted transition-colors hover:bg-surface-3 hover:text-text-secondary"
        >
          Reset to 100%
        </button>
      )}
    </div>,
    document.body,
  );
}
