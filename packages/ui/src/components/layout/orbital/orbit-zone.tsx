/**
 * @module orbit-zone
 * Renders a voice channel as a pulsing ring "orbit zone" in the orbital view.
 * Two concentric rings pulse at different delays, and a label displays the
 * channel name. Double-click the invisible interaction area to join voice.
 */
'use client';

import clsx from 'clsx';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrbitZoneProps {
  /** Channel ID */
  id: string;
  /** Channel name */
  name: string;
  /** Center position as fraction of viewport (0-1) */
  cx: number;
  cy: number;
  /** Radius in pixels */
  radius: number;
  /** Orbit color hex string */
  color: string;
  /** Number of members in this orbit */
  memberCount: number;
  /** Whether this orbit was just created (show spawn animation) */
  spawning?: boolean;
  /** Called when user double-clicks to join voice */
  onDoubleClick?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OrbitZone({
  id,
  name,
  cx,
  cy,
  radius,
  color,
  memberCount,
  spawning = false,
  onDoubleClick,
}: OrbitZoneProps) {
  const d1 = radius * 2;
  const d2 = radius * 2.4;

  return (
    <div
      className={clsx(
        'orbit-zone absolute pointer-events-none transition-opacity duration-400',
        spawning && 'spawning animate-[orbitSpawn_0.5s_cubic-bezier(0.34,1.56,0.64,1)_forwards]',
      )}
      style={{
        left: `${cx * 100}%`,
        top: `${cy * 100}%`,
        width: `${d1}px`,
        height: `${d1}px`,
        transform: 'translate(-50%, -50%)',
      }}
      data-channel-id={id}
    >
      {/* Primary ring */}
      <div
        className="oz-ring r1 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full animate-[orbitPulse_4s_ease_infinite]"
        style={{
          width: `${d1}px`,
          height: `${d1}px`,
          borderWidth: '1.5px',
          borderStyle: 'solid',
          borderColor: color,
        }}
      />

      {/* Secondary ring — larger, delayed, dimmer */}
      <div
        className="oz-ring r2 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full animate-[orbitPulse_4s_ease_infinite]"
        style={{
          width: `${d2}px`,
          height: `${d2}px`,
          borderWidth: '1.5px',
          borderStyle: 'solid',
          borderColor: color,
          opacity: 0.5,
          animationDelay: '0.6s',
        }}
      />

      {/* Channel name label */}
      <div
        className="oz-label absolute left-1/2 -translate-x-1/2 font-mono text-[10px] tracking-[0.1em] uppercase whitespace-nowrap"
        style={{
          top: '10px',
          color,
        }}
      >
        {name}
      </div>

      {/* Invisible interaction area — captures double-click to join voice */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-auto cursor-pointer"
        style={{
          width: `${d2}px`,
          height: `${d2}px`,
        }}
        onDoubleClick={onDoubleClick}
        role="button"
        tabIndex={0}
        aria-label={`${name} — voice channel, ${memberCount} member${memberCount !== 1 ? 's' : ''}. Double-click to join.`}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onDoubleClick?.();
          }
        }}
      />
    </div>
  );
}
