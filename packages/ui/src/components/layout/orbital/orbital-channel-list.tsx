/**
 * @module orbital-channel-list
 * Slide-out sidebar listing text channels and voice orbits for the orbital view.
 * Positioned to the right of the hub sidebar (left: 96px) and slides in/out
 * with a cubic-bezier transition. Contains two scrollable groups: TEXT channels
 * (prefixed with #) and VOICE ORBITS (with colored status dots).
 */
'use client';

import clsx from 'clsx';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrbitalChannelListProps {
  open: boolean;
  onClose: () => void;
  textChannels: Array<{ id: string; name: string; unreadCount: number }>;
  voiceOrbits: Array<{ id: string; name: string; color: string; onlineCount: number }>;
  activeChannelId: string | null;
  onTextChannelSelect: (id: string) => void;
  onVoiceOrbitSelect: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OrbitalChannelList({
  open,
  onClose,
  textChannels,
  voiceOrbits,
  activeChannelId,
  onTextChannelSelect,
  onVoiceOrbitSelect,
}: OrbitalChannelListProps) {
  return (
    <div
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
        transform: open ? 'translateX(0)' : 'translateX(-220px)',
        transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-3 py-2.5 shrink-0">
        <span
          className="font-mono text-[10px] tracking-[0.14em] uppercase text-text-secondary"
        >
          Orbits
        </span>
        <button
          type="button"
          onClick={onClose}
          className={clsx(
            'flex items-center justify-center w-[22px] h-[22px] rounded',
            'text-text-muted hover:text-text-primary',
            'hover:bg-white/5 transition-colors duration-150',
          )}
          aria-label="Close channel list"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            className="text-current"
          >
            <line
              x1="2"
              y1="2"
              x2="10"
              y2="10"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <line
              x1="10"
              y1="2"
              x2="2"
              y2="10"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* ── Scrollable channel list ── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-1.5 pb-2">
        {/* TEXT group */}
        {textChannels.length > 0 && (
          <div className="mb-3">
            <div className="px-2 py-1.5">
              <span className="font-mono text-[9px] tracking-[0.16em] uppercase text-text-muted">
                Text
              </span>
            </div>

            {textChannels.map((ch) => {
              const isActive = ch.id === activeChannelId;
              return (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => onTextChannelSelect(ch.id)}
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
        )}

        {/* VOICE ORBITS group */}
        {voiceOrbits.length > 0 && (
          <div>
            <div className="px-2 py-1.5">
              <span className="font-mono text-[9px] tracking-[0.16em] uppercase text-text-muted">
                Voice Orbits
              </span>
            </div>

            {voiceOrbits.map((orbit) => {
              const isActive = orbit.id === activeChannelId;
              return (
                <button
                  key={orbit.id}
                  type="button"
                  onClick={() => onVoiceOrbitSelect(orbit.id)}
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
        )}
      </div>
    </div>
  );
}
