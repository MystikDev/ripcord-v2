/**
 * @module splinter-button
 * "Splinter New Orbit" button — creates a new voice channel with a burst
 * particle animation. Fixed to the bottom-right of the orbital view.
 * Particles are injected directly into the DOM (fire-and-forget) so React
 * never re-renders for the visual effect.
 */
'use client';

import { useState, useCallback, useRef } from 'react';
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
const PARTICLE_COUNT = 12;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SplinterButtonProps {
  hubId: string;
  /** Whether the user has permission to create channels */
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
// Burst animation (direct DOM, no React state)
// ---------------------------------------------------------------------------

function fireBurstAnimation(sourceEl: HTMLElement, colorIndex: number) {
  const rect = sourceEl.getBoundingClientRect();
  const sx = rect.left + rect.width / 2;
  const sy = rect.top;
  const color = ORBIT_COLORS[colorIndex % ORBIT_COLORS.length];

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const p = document.createElement('div');
    const tx = (Math.random() - 0.5) * 120;
    const ty = -40 - Math.random() * 80;

    p.style.cssText = `
      position:fixed;
      left:${sx}px;
      top:${sy}px;
      width:8px;
      height:8px;
      border-radius:50%;
      background:${color};
      pointer-events:none;
      z-index:50;
      box-shadow:0 0 6px ${color};
      --tx:${tx}px;
      --ty:${ty}px;
      animation:burstOut 0.6s cubic-bezier(0,0,0.2,1) ${i * 18}ms forwards;
    `;

    document.body.appendChild(p);
    setTimeout(() => p.remove(), 800);
  }
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
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleClick = useCallback(async () => {
    if (disabled || !btnRef.current) return;

    // Debounce
    setDisabled(true);
    setTimeout(() => setDisabled(false), DEBOUNCE_MS);

    // Inject keyframes stylesheet if not already present
    ensureBurstKeyframes();

    // Fire burst particles
    fireBurstAnimation(btnRef.current, existingVoiceCount);

    // Generate channel name
    const name = CHANNEL_NAMES[existingVoiceCount % CHANNEL_NAMES.length];

    // Delay API call slightly to let animation start
    await new Promise((r) => setTimeout(r, API_DELAY_MS));

    try {
      const channel = await createChannel(hubId, name, 'voice');
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
  }, [disabled, hubId, existingVoiceCount, onChannelCreated]);

  if (!canCreate) return null;

  return (
    <button
      ref={btnRef}
      type="button"
      disabled={disabled}
      onClick={handleClick}
      aria-label="Splinter new orbit"
      className="create-orbit-btn"
      style={{
        position: 'fixed',
        bottom: '64px',
        right: '20px',
        zIndex: 200,
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
  );
}
