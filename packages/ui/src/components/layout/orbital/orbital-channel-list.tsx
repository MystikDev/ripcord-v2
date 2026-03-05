/**
 * @module orbital-channel-list
 * Hover-to-reveal sidebar listing text channels and voice orbits for the
 * orbital view. Positioned to the right of the hub sidebar (left: 96px).
 * Self-managed visibility: hover the trigger zone to open, mouse-leave to
 * close after a delay. Contains two scrollable groups: TEXT channels
 * (prefixed with #) and VOICE ORBITS (with colored status dots). Includes
 * right-click context menu for rename/delete and + buttons for creation.
 */
'use client';

import { useCallback, useRef, useState } from 'react';
import clsx from 'clsx';
import { ChannelListContextMenu } from './channel-list-context-menu';
import { createChannel } from '../../../lib/hub-api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrbitalChannelListProps {
  hubId: string;
  textChannels: Array<{ id: string; name: string; unreadCount: number }>;
  voiceOrbits: Array<{ id: string; name: string; color: string; onlineCount: number }>;
  activeChannelId: string | null;
  onTextChannelSelect: (id: string) => void;
  onVoiceOrbitSelect: (id: string) => void;
  canManageChannels: boolean;
  onChannelCreated: (channel: { id: string; hubId: string; name: string; type: 'text' | 'voice'; position: number }) => void;
  onChannelDeleted: (channelId: string) => void;
  onChannelRenamed: (channelId: string, newName: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OrbitalChannelList({
  hubId,
  textChannels,
  voiceOrbits,
  activeChannelId,
  onTextChannelSelect,
  onVoiceOrbitSelect,
  canManageChannels,
  onChannelCreated,
  onChannelDeleted,
  onChannelRenamed,
}: OrbitalChannelListProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // -- Context menu state ---
  const [ctxMenu, setCtxMenu] = useState<{
    channelId: string;
    channelName: string;
    channelType: 'text' | 'voice';
    position: { x: number; y: number };
  } | null>(null);

  // -- Inline channel creation state ---
  const [creatingType, setCreatingType] = useState<'text' | 'voice' | null>(null);
  const [createName, setCreateName] = useState('');
  const [creating, setCreating] = useState(false);

  // -- Hover handlers ---
  const cancelClose = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const handleTriggerEnter = useCallback(() => {
    cancelClose();
    setPanelOpen(true);
  }, [cancelClose]);

  const handlePanelLeave = useCallback(() => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => {
      setPanelOpen(false);
    }, 200);
  }, [cancelClose]);

  const handlePanelEnter = useCallback(() => {
    cancelClose();
  }, [cancelClose]);

  // -- Context menu ---
  const handleContextMenu = useCallback(
    (channelId: string, channelName: string, channelType: 'text' | 'voice') =>
      (e: React.MouseEvent) => {
        e.preventDefault();
        if (!canManageChannels) return;
        setCtxMenu({ channelId, channelName, channelType, position: { x: e.clientX, y: e.clientY } });
      },
    [canManageChannels],
  );

  // -- Channel creation ---
  const handleCreateSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = createName.trim();
      if (!trimmed || !creatingType) return;
      setCreating(true);
      try {
        const ch = await createChannel(hubId, trimmed, creatingType);
        onChannelCreated({ ...ch, position: 0 });
        setCreateName('');
        setCreatingType(null);
      } catch {
        console.error('[OrbitalChannelList] Failed to create channel');
      } finally {
        setCreating(false);
      }
    },
    [createName, creatingType, hubId, onChannelCreated],
  );

  return (
    <>
      {/* ── Trigger zone with visual affordance ── */}
      <div
        onMouseEnter={handleTriggerEnter}
        onMouseLeave={handlePanelLeave}
        style={{
          position: 'fixed',
          left: 96,
          top: 46,
          bottom: 54,
          width: 40,
          zIndex: 179,
        }}
      >
        {/* Visible affordance bar — subtle hint that hovering reveals channels */}
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1.5 pointer-events-none"
          style={{ paddingLeft: '4px' }}
        >
          {/* Thin vertical bar */}
          <div
            className="rounded-full transition-opacity duration-200"
            style={{
              width: '3px',
              height: '40px',
              background: 'rgba(255, 255, 255, 0.12)',
            }}
          />
          {/* Chevron hint */}
          <span
            className="font-mono select-none"
            style={{ fontSize: '9px', color: 'rgba(255,255,255,0.18)', letterSpacing: '0.05em' }}
          >
            C
          </span>
        </div>
      </div>

      {/* ── Panel ── */}
      <div
        onMouseEnter={handlePanelEnter}
        onMouseLeave={handlePanelLeave}
        className="fixed flex flex-col z-[180]"
        style={{
          left: '96px',
          top: '46px',
          bottom: '54px',
          width: '200px',
          background: 'rgba(7, 9, 13, 0.95)',
          borderRight: '1px solid var(--color-border)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          transform: panelOpen ? 'translateX(0)' : 'translateX(-220px)',
          transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          pointerEvents: panelOpen ? 'auto' : 'none',
        }}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-3 py-2.5 shrink-0">
          <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-text-secondary">
            Channels
          </span>
        </div>

        {/* ── Scrollable channel list ── */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-1.5 pb-2">
          {/* TEXT group */}
          <div className="mb-3">
            <div className="flex items-center justify-between px-2 py-1.5">
              <span className="font-mono text-[9px] tracking-[0.16em] uppercase text-text-muted">
                Text
              </span>
              {canManageChannels && (
                <button
                  type="button"
                  onClick={() => { setCreatingType('text'); setCreateName(''); }}
                  className="flex items-center justify-center w-[16px] h-[16px] rounded text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors duration-150"
                  aria-label="Add text channel"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <line x1="5" y1="1" x2="5" y2="9" />
                    <line x1="1" y1="5" x2="9" y2="5" />
                  </svg>
                </button>
              )}
            </div>

            {/* Inline text creation input */}
            {creatingType === 'text' && (
              <form onSubmit={handleCreateSubmit} className="px-2 pb-1">
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="channel-name"
                  autoFocus
                  disabled={creating}
                  className="w-full rounded px-2 py-1 text-[11px] font-mono bg-white/5 border border-white/10 text-text-primary outline-none focus:border-cyan/50 placeholder:text-text-muted"
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setCreatingType(null);
                  }}
                />
              </form>
            )}

            {textChannels.map((ch) => {
              const isActive = ch.id === activeChannelId;
              return (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => onTextChannelSelect(ch.id)}
                  onContextMenu={handleContextMenu(ch.id, ch.name, 'text')}
                  className={clsx(
                    'w-full flex items-center gap-1.5 px-2 py-[5px] rounded text-left',
                    'text-[12px] font-sans transition-colors duration-100',
                    isActive
                      ? 'text-cyan bg-cyan/8'
                      : 'text-text-secondary hover:text-text-primary hover:bg-white/4',
                  )}
                >
                  <span className="text-text-muted text-[11px] shrink-0">#</span>
                  <span className="truncate flex-1">{ch.name}</span>
                  {ch.unreadCount > 0 && (
                    <span
                      className={clsx(
                        'shrink-0 min-w-[16px] h-[16px] rounded-full flex items-center justify-center',
                        'text-[9px] font-mono font-bold',
                        isActive
                          ? 'bg-cyan/20 text-cyan'
                          : 'bg-accent-magenta/20 text-accent-magenta',
                      )}
                    >
                      {ch.unreadCount > 99 ? '99+' : ch.unreadCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* VOICE ORBITS group */}
          <div>
            <div className="flex items-center justify-between px-2 py-1.5">
              <span className="font-mono text-[9px] tracking-[0.16em] uppercase text-text-muted">
                Voice Orbits
              </span>
              {canManageChannels && (
                <button
                  type="button"
                  onClick={() => { setCreatingType('voice'); setCreateName(''); }}
                  className="flex items-center justify-center w-[16px] h-[16px] rounded text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors duration-150"
                  aria-label="Add voice orbit"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <line x1="5" y1="1" x2="5" y2="9" />
                    <line x1="1" y1="5" x2="9" y2="5" />
                  </svg>
                </button>
              )}
            </div>

            {/* Inline voice creation input */}
            {creatingType === 'voice' && (
              <form onSubmit={handleCreateSubmit} className="px-2 pb-1">
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="orbit-name"
                  autoFocus
                  disabled={creating}
                  className="w-full rounded px-2 py-1 text-[11px] font-mono bg-white/5 border border-white/10 text-text-primary outline-none focus:border-cyan/50 placeholder:text-text-muted"
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setCreatingType(null);
                  }}
                />
              </form>
            )}

            {voiceOrbits.map((orbit) => {
              const isActive = orbit.id === activeChannelId;
              return (
                <button
                  key={orbit.id}
                  type="button"
                  onClick={() => onVoiceOrbitSelect(orbit.id)}
                  onContextMenu={handleContextMenu(orbit.id, orbit.name, 'voice')}
                  className={clsx(
                    'w-full flex items-center gap-2 px-2 py-[5px] rounded text-left',
                    'text-[12px] font-sans transition-colors duration-100',
                    isActive
                      ? 'text-cyan bg-cyan/8'
                      : 'text-text-secondary hover:text-text-primary hover:bg-white/4',
                  )}
                >
                  {/* Colored dot */}
                  <span
                    className="shrink-0 w-[8px] h-[8px] rounded-full"
                    style={{
                      backgroundColor: orbit.color,
                      boxShadow: `0 0 6px ${orbit.color}66`,
                    }}
                  />
                  <span className="truncate flex-1">{orbit.name}</span>
                  {orbit.onlineCount > 0 && (
                    <span className="shrink-0 font-mono text-[10px] text-text-muted">
                      {orbit.onlineCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Context menu ── */}
      {ctxMenu && (
        <ChannelListContextMenu
          channelId={ctxMenu.channelId}
          channelName={ctxMenu.channelName}
          channelType={ctxMenu.channelType}
          hubId={hubId}
          position={ctxMenu.position}
          onClose={() => setCtxMenu(null)}
          canManageChannels={canManageChannels}
          onChannelDeleted={(id) => {
            onChannelDeleted(id);
            setCtxMenu(null);
          }}
          onChannelRenamed={(id, name) => {
            onChannelRenamed(id, name);
            setCtxMenu(null);
          }}
        />
      )}
    </>
  );
}
