/**
 * @module user-tooltip
 * Mouse-following tooltip shown when hovering a user node in the orbital view.
 * Displays name, status, orbit channel, and ping in a compact glass card that
 * clamps to viewport edges so it never overflows.
 */
'use client';

import clsx from 'clsx';

// ---------------------------------------------------------------------------
// Status label + color mapping
// ---------------------------------------------------------------------------

const STATUS_META: Record<
  UserTooltipProps['status'],
  { label: string; color: string }
> = {
  ONLINE: { label: 'ONLINE', color: '#00ff9d' },
  YOU: { label: 'YOU', color: '#00e5ff' },
  MUTED: { label: 'MUTED', color: '#ff4060' },
  IDLE: { label: 'IDLE', color: '#ffbe0b' },
  DND: { label: 'DO NOT DISTURB', color: '#ff4060' },
  OFFLINE: { label: 'OFFLINE', color: '#404450' },
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UserTooltipProps {
  visible: boolean;
  /** Mouse X position (clientX) */
  x: number;
  /** Mouse Y position (clientY) */
  y: number;
  /** Display name */
  name: string;
  /** Presence / role status */
  status: 'ONLINE' | 'YOU' | 'MUTED' | 'IDLE' | 'DND' | 'OFFLINE';
  /** Orbit channel name, or "NONE" if not in a channel */
  orbitName: string;
  /** Latency string, e.g. "14ms" or "\u2014" */
  ping: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function UserTooltip({
  visible,
  x,
  y,
  name,
  status,
  orbitName,
  ping,
}: UserTooltipProps) {
  const meta = STATUS_META[status];

  // ---- Position clamping --------------------------------------------------
  // Offset +14px right, -10px up from cursor by default.
  // If the tooltip would overflow right or bottom, flip to the other side.
  let tx = x + 14;
  let ty = y - 10;

  if (typeof window !== 'undefined') {
    if (tx + 170 > window.innerWidth) tx = x - 184;
    if (ty + 130 > window.innerHeight) ty = y - 130;
  }

  return (
    <div
      className={clsx(
        'pointer-events-none fixed z-[300]',
        'transition-opacity duration-[120ms]',
        visible ? 'opacity-100' : 'opacity-0',
      )}
      style={{
        left: `${tx}px`,
        top: `${ty}px`,
        background: 'rgba(7, 9, 13, 0.97)',
        border: '1px solid rgba(0, 229, 255, 0.25)',
        borderRadius: '10px',
        padding: '10px 13px',
        fontFamily: 'var(--font-mono)',
        fontSize: '11px',
        minWidth: '155px',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 8px 28px rgba(0, 0, 0, 0.6)',
      }}
    >
      {/* ── Name row ── */}
      <div
        className="font-display font-semibold text-white mb-[6px]"
        style={{ fontSize: '13px', letterSpacing: '0.03em' }}
      >
        {name}
      </div>

      {/* ── STATUS row ── */}
      <Row label="STATUS">
        <span style={{ color: meta.color }}>{meta.label}</span>
      </Row>

      {/* ── ORBIT row ── */}
      <Row label="ORBIT">
        <span className="text-cyan">{orbitName}</span>
      </Row>

      {/* ── PING row ── */}
      <Row label="PING">
        <span className="text-cyan">{ping}</span>
      </Row>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal row component
// ---------------------------------------------------------------------------

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 leading-[1.7]">
      <span className="text-white/40 uppercase tracking-[0.08em]">
        {label}
      </span>
      {children}
    </div>
  );
}
