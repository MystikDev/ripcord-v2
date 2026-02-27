/**
 * @module participant-context-menu
 * Right-click context menu for voice channel participants. Provides a per-user
 * volume slider (0-100%) persisted to the settings store, a reset-to-100%
 * button, and admin actions (server mute, move to channel) gated by permissions.
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSettingsStore } from '../../stores/settings-store';
import { useHubStore } from '../../stores/server-store';
import { useVoiceStateStore } from '../../stores/voice-state-store';
import { useHasPermission } from '../../hooks/use-has-permission';
import { Permission } from '@ripcord/types';
import { apiFetch } from '../../lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParticipantContextMenuProps {
  userId: string;
  displayName: string;
  channelId: string;
  position: { x: number; y: number };
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MENU_WIDTH = 220;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ParticipantContextMenu({
  userId,
  displayName,
  channelId,
  position,
  onClose,
}: ParticipantContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const volume = useSettingsStore((s) => s.userVolumes[userId] ?? 1.0);
  const setUserVolume = useSettingsStore((s) => s.setUserVolume);
  const resetUserVolume = useSettingsStore((s) => s.resetUserVolume);

  // Admin permissions
  const canMute = useHasPermission(Permission.MUTE_MEMBERS);
  const canMove = useHasPermission(Permission.MOVE_MEMBERS);
  const hasAdminActions = canMute || canMove;

  // Server mute state for this user
  const isServerMuted = useVoiceStateStore((s) => {
    const participants = s.voiceStates[channelId];
    return participants?.find((p) => p.userId === userId)?.serverMute ?? false;
  });

  // Voice channels for "Move to" (exclude current channel)
  const activeHubId = useHubStore((s) => s.activeHubId);
  const channels = useHubStore((s) => s.channels);
  const voiceChannels = channels.filter((c) => c.type === 'voice' && c.id !== channelId);

  const [showMoveList, setShowMoveList] = useState(false);

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
  const menuHeight = hasAdminActions ? 240 : 120;
  const x = Math.min(position.x, window.innerWidth - MENU_WIDTH - 8);
  const y = Math.min(position.y, window.innerHeight - menuHeight - 8);

  const percentage = Math.round(volume * 100);
  const isDefault = !(userId in useSettingsStore.getState().userVolumes);

  // Admin action handlers
  const handleServerMute = async () => {
    if (!activeHubId) return;
    const res = await apiFetch('/v1/voice/server-mute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hubId: activeHubId,
        channelId,
        userId,
        muted: !isServerMuted,
      }),
    });
    if (res.ok) {
      onClose();
    }
  };

  const handleMove = async (targetChannelId: string) => {
    if (!activeHubId) return;
    const res = await apiFetch('/v1/voice/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hubId: activeHubId,
        channelId,
        targetChannelId,
        userId,
      }),
    });
    if (res.ok) {
      onClose();
    }
  };

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

      {/* Admin actions */}
      {hasAdminActions && (
        <>
          <div className="my-2 border-t border-border" />

          {/* Server Mute */}
          {canMute && (
            <button
              onClick={handleServerMute}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-[11px] text-text-muted transition-colors hover:bg-surface-3 hover:text-text-secondary"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <rect x="5.5" y="1" width="5" height="8" rx="2.5" />
                <path d="M3 7.5a5 5 0 0 0 10 0" />
                {!isServerMuted && <path d="M2 2l12 12" strokeWidth="2" />}
                {isServerMuted && (
                  <>
                    <path d="M8 12v2.5" />
                    <path d="M5.5 14.5h5" />
                  </>
                )}
              </svg>
              {isServerMuted ? 'Server Unmute' : 'Server Mute'}
            </button>
          )}

          {/* Move to */}
          {canMove && voiceChannels.length > 0 && (
            <div>
              <button
                onClick={() => setShowMoveList(!showMoveList)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-[11px] text-text-muted transition-colors hover:bg-surface-3 hover:text-text-secondary"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <path d="M12 8H4M8 4l4 4-4 4" />
                </svg>
                Move to...
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`ml-auto shrink-0 transition-transform ${showMoveList ? 'rotate-90' : ''}`}
                >
                  <path d="M6 4l4 4-4 4" />
                </svg>
              </button>
              {showMoveList && (
                <div className="ml-4 mt-1 space-y-0.5">
                  {voiceChannels.map((ch) => (
                    <button
                      key={ch.id}
                      onClick={() => handleMove(ch.id)}
                      className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-[11px] text-text-muted transition-colors hover:bg-surface-3 hover:text-text-secondary"
                    >
                      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                        <rect x="5.5" y="1" width="5" height="8" rx="2.5" />
                        <path d="M3 7.5a5 5 0 0 0 10 0" />
                      </svg>
                      <span className="truncate">{ch.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>,
    document.body,
  );
}
