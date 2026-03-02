/**
 * @module orbital-topbar
 * Fixed top gradient bar for the orbital (solar system) view. Displays the hub
 * logo, hub name, active orbit count badge, and a channel-list toggle button.
 * Fades to transparent at the bottom so it blends into the canvas beneath it.
 */
'use client';

import clsx from 'clsx';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OrbitalTopbarProps {
  hubName: string;
  hubIconUrl?: string;
  activeOrbitCount: number;
  onChannelListToggle: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OrbitalTopbar({
  hubName,
  hubIconUrl,
  activeOrbitCount,
  onChannelListToggle,
}: OrbitalTopbarProps) {
  const initials = hubName.slice(0, 2).toUpperCase();

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[200] flex items-center px-4 gap-[10px]"
      style={{
        height: '46px',
        background:
          'linear-gradient(to bottom, rgba(7, 9, 13, 0.98), rgba(7, 9, 13, 0))',
      }}
    >
      {/* ── Hub logo ── */}
      <div
        className={clsx(
          'flex-shrink-0 flex items-center justify-center rounded-[6px]',
          'font-display font-bold text-[12px] text-white select-none',
        )}
        style={{
          width: '28px',
          height: '28px',
          background: hubIconUrl
            ? undefined
            : 'linear-gradient(135deg, #00e5ff, #007cf0)',
          overflow: 'hidden',
        }}
      >
        {hubIconUrl ? (
          <img
            src={hubIconUrl}
            alt={hubName}
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          initials
        )}
      </div>

      {/* ── Hub name ── */}
      <span
        className="font-display font-semibold text-white whitespace-nowrap"
        style={{
          fontSize: '15px',
          letterSpacing: '0.05em',
        }}
      >
        {hubName}
      </span>

      {/* ── Divider ── */}
      <div
        className="flex-shrink-0"
        style={{
          width: '1px',
          height: '16px',
          background: 'rgba(255, 255, 255, 0.12)',
        }}
      />

      {/* ── Active orbit count badge ── */}
      <div
        className={clsx(
          'flex items-center gap-[6px] rounded-full',
          'font-mono text-[10px] tracking-[0.08em] uppercase',
          'text-white/60 select-none',
        )}
        style={{
          padding: '3px 10px 3px 8px',
          background: 'rgba(255, 255, 255, 0.06)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        {/* Cyan dot */}
        <span
          className="flex-shrink-0 rounded-full"
          style={{
            width: '6px',
            height: '6px',
            background: '#00e5ff',
            boxShadow: '0 0 6px rgba(0, 229, 255, 0.5)',
          }}
        />
        {activeOrbitCount} ACTIVE ORBIT{activeOrbitCount !== 1 ? 'S' : ''}
      </div>

      {/* ── Spacer ── */}
      <div className="flex-1" />

      {/* ── Channel list toggle button ── */}
      <button
        type="button"
        onClick={onChannelListToggle}
        className={clsx(
          'flex items-center justify-center rounded-md',
          'text-white/50 hover:text-white/80 transition-colors duration-150',
          'cursor-pointer',
        )}
        style={{
          width: '32px',
          height: '32px',
          background: 'rgba(255, 255, 255, 0.06)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}
        aria-label="Toggle channel list"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <line x1="2" y1="4" x2="14" y2="4" />
          <line x1="2" y1="8" x2="14" y2="8" />
          <line x1="2" y1="12" x2="14" y2="12" />
        </svg>
      </button>
    </div>
  );
}
