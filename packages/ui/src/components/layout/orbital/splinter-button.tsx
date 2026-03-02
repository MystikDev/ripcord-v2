/**
 * @module splinter-button
 * "Splinter New Orbit" button — creates a new voice channel (permanent or
 * temporary) with a burst particle animation. Fixed to the bottom-right of
 * the orbital view. When clicked, shows an inline permanent/temporary
 * selector before firing the API call.
 */
'use client';

import { useState, useCallback, useRef } from 'react';
import clsx from 'clsx';
import { createChannel } from '../../../lib/hub-api';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ORBIT_COLORS = [
  '#00e5ff',
  '#b060ff',
  '#00ff9d',
  '#ff9030',
  '#ff4060',
  '#ffeb3b',
  '#ff69b4',
] as const;

const CHANNEL_NAMES = [
  'GROUP-2',
  'SQUAD-BETA',
  'ZONE-3',
  'SIDE-CHANNEL',
  'ARC-4',
  'DEEP-SPACE',
] as const;

/** Debounce duration after a click (ms) */
const DEBOUNCE_MS = 1200;

/** Delay before API call to let animation start (ms) */
const API_DELAY_MS = 280;

/** Number of burst particles */
const PARTICLE_COUNT = 16;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SplinterButtonProps {
  hubId: string;
  /** Whether the user has permission to create channels (MANAGE_CHANNELS | CREATE_ORBIT) */
  canCreate: boolean;
  /** Callback with the new channel data on success */
  onChannelCreated: (channel: {
    id: string;
    hubId: string;
    name: string;
    type: 'voice';
    position: number;
  }) => void;
  /** Current number of voice channels (for naming) */
  existingVoiceCount: number;
}

// ---------------------------------------------------------------------------
// 3-phase burst animation (direct DOM, no React state)
// Phase 1: Converge (particles move inward to center)
// Phase 2: Glow (central flash ring)
// Phase 3: Explode (particles burst outward)
// ---------------------------------------------------------------------------

function fireBurstAnimation(sourceEl: HTMLElement, colorIndex: number) {
  const rect = sourceEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top;
  const color = ORBIT_COLORS[colorIndex % ORBIT_COLORS.length];

  // Phase 1: Converge — particles spawn at random positions and animate to center
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const p = document.createElement('div');
    const startX = (Math.random() - 0.5) * 200;
    const startY = -60 - Math.random() * 120;

    p.style.cssText = `
      position:fixed;
      left:${cx}px;
      top:${cy}px;
      width:6px;
      height:6px;
      border-radius:50%;
      background:${color};
      pointer-events:none;
      z-index:50;
      box-shadow:0 0 6px ${color};
      --sx:${startX}px;
      --sy:${startY}px;
      animation:burstIn 0.4s cubic-bezier(0.4,0,0.2,1) ${i * 15}ms forwards;
    `;

    document.body.appendChild(p);
    setTimeout(() => p.remove(), 500);
  }

  // Phase 2: Glow — central flash ring after converge completes
  setTimeout(() => {
    const glow = document.createElement('div');
    glow.style.cssText = `
      position:fixed;
      left:${cx}px;
      top:${cy}px;
      width:30px;
      height:30px;
      border-radius:50%;
      border:2px solid ${color};
      pointer-events:none;
      z-index:50;
      box-shadow:0 0 20px ${color}, inset 0 0 12px ${color};
      animation:centerGlow 0.3s ease-out forwards;
    `;
    document.body.appendChild(glow);
    setTimeout(() => glow.remove(), 400);
  }, 380);

  // Phase 3: Explode — particles burst outward with increased travel
  setTimeout(() => {
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = document.createElement('div');
      const tx = (Math.random() - 0.5) * 180;
      const ty = -50 - Math.random() * 120;

      p.style.cssText = `
        position:fixed;
        left:${cx}px;
        top:${cy}px;
        width:8px;
        height:8px;
        border-radius:50%;
        background:${color};
        pointer-events:none;
        z-index:50;
        box-shadow:0 0 8px ${color};
        --tx:${tx}px;
        --ty:${ty}px;
        animation:burstOut 0.6s cubic-bezier(0,0,0.2,1) ${i * 12}ms forwards;
      `;

      document.body.appendChild(p);
      setTimeout(() => p.remove(), 800);
    }
  }, 600);
}

// ---------------------------------------------------------------------------
// Inject keyframes once
// ---------------------------------------------------------------------------

let stylesInjected = false;

function ensureBurstKeyframes() {
  if (stylesInjected) return;
  stylesInjected = true;

  const sheet = document.createElement('style');
  sheet.textContent = `
    @keyframes burstOut {
      0% {
        opacity: 1;
        transform: translate(0, 0) scale(1);
      }
      100% {
        opacity: 0;
        transform: translate(var(--tx), var(--ty)) scale(0.3);
      }
    }
    @keyframes burstIn {
      0% {
        opacity: 0.3;
        transform: translate(var(--sx), var(--sy)) scale(0.5);
      }
      100% {
        opacity: 1;
        transform: translate(0, 0) scale(1);
      }
    }
    @keyframes centerGlow {
      0% {
        opacity: 1;
        transform: translate(-50%, -50%) scale(0.5);
      }
      100% {
        opacity: 0;
        transform: translate(-50%, -50%) scale(3);
      }
    }
  `;
  document.head.appendChild(sheet);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SplinterButton({
  hubId,
  canCreate,
  onChannelCreated,
  existingVoiceCount,
}: SplinterButtonProps) {
  const [disabled, setDisabled] = useState(false);
  const [showTypeChoice, setShowTypeChoice] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  const createOrbit = useCallback(
    async (temporary: boolean) => {
      if (disabled || !btnRef.current) return;

      // Close choice and debounce
      setShowTypeChoice(false);
      setDisabled(true);
      setTimeout(() => setDisabled(false), DEBOUNCE_MS);

      // Inject keyframes stylesheet if not already present
      ensureBurstKeyframes();

      // Fire 3-phase burst animation
      fireBurstAnimation(btnRef.current, existingVoiceCount);

      // Generate channel name
      const name = CHANNEL_NAMES[existingVoiceCount % CHANNEL_NAMES.length];

      // Delay API call slightly to let animation start
      await new Promise((r) => setTimeout(r, API_DELAY_MS));

      try {
        const channel = await createChannel(hubId, name, 'voice', { temporary });
        onChannelCreated({
          id: channel.id,
          hubId: channel.hubId,
          name: channel.name,
          type: 'voice',
          position: existingVoiceCount,
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[SplinterButton] Failed to create channel:', err);
      }
    },
    [disabled, hubId, existingVoiceCount, onChannelCreated],
  );

  const handleClick = useCallback(() => {
    if (disabled) return;
    setShowTypeChoice((prev) => !prev);
  }, [disabled]);

  if (!canCreate) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '64px',
        right: '20px',
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: '6px',
      }}
    >
      {/* ── Type choice popover ── */}
      {showTypeChoice && (
        <div
          className="flex gap-2 p-1.5 rounded-lg"
          style={{
            background: 'rgba(7, 9, 13, 0.95)',
            border: '1px solid rgba(0, 229, 255, 0.2)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <button
            type="button"
            onClick={() => createOrbit(false)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md',
              'font-mono text-[10px] tracking-wider uppercase',
              'transition-all duration-150 cursor-pointer',
              'text-cyan hover:bg-cyan/10',
            )}
            style={{ border: '1px solid rgba(0, 229, 255, 0.2)' }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="shrink-0">
              <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
            Permanent
          </button>
          <button
            type="button"
            onClick={() => createOrbit(true)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md',
              'font-mono text-[10px] tracking-wider uppercase',
              'transition-all duration-150 cursor-pointer',
              'text-amber-400 hover:bg-amber-400/10',
            )}
            style={{ border: '1px solid rgba(251, 191, 36, 0.2)' }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="shrink-0">
              <path d="M3 1L2 5h2L3 9l4-5H5L7 1H3z" fill="currentColor" opacity="0.7" />
            </svg>
            Temporary
          </button>
        </div>
      )}

      {/* ── Main button ── */}
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={handleClick}
        aria-label="Splinter new orbit"
        className="create-orbit-btn"
        style={{
          background: disabled
            ? 'rgba(7, 9, 13, 0.6)'
            : 'rgba(7, 9, 13, 0.92)',
          border: '1px solid rgba(0, 229, 255, 0.3)',
          borderRadius: '12px',
          padding: '9px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontFamily: 'var(--mono)',
          fontSize: '11px',
          color: disabled ? 'rgba(0, 229, 255, 0.4)' : 'var(--cyan)',
          cursor: disabled ? 'default' : 'pointer',
          transition: 'all 0.18s',
          backdropFilter: 'blur(10px)',
          letterSpacing: '0.06em',
          opacity: disabled ? 0.6 : 1,
        }}
        onMouseEnter={(e) => {
          if (disabled) return;
          const el = e.currentTarget;
          el.style.background = 'var(--cyan-dim)';
          el.style.borderColor = 'var(--cyan)';
          el.style.boxShadow = '0 0 20px rgba(0, 229, 255, 0.2)';
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget;
          el.style.background = disabled
            ? 'rgba(7, 9, 13, 0.6)'
            : 'rgba(7, 9, 13, 0.92)';
          el.style.borderColor = 'rgba(0, 229, 255, 0.3)';
          el.style.boxShadow = 'none';
        }}
      >
        {/* Plus icon */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          className="shrink-0"
        >
          <line
            x1="7"
            y1="2"
            x2="7"
            y2="12"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <line
            x1="2"
            y1="7"
            x2="12"
            y2="7"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>

        <span style={{ whiteSpace: 'nowrap' }}>SPLINTER ORBIT</span>
      </button>
    </div>
  );
}
