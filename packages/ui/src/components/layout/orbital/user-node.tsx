/**
 * @module user-node
 * Renders a user avatar node in the orbital view. Shows an avatar circle
 * (image or initials on gradient), status dot, optional mute badge, name
 * label, and pulsing concentric rings for online / speaking users.
 */
'use client';

import clsx from 'clsx';

// ---------------------------------------------------------------------------
// Status colors
// ---------------------------------------------------------------------------

const STATUS_COLOR: Record<UserNodeProps['status'], string> = {
  online: '#00ff9d',
  idle: '#ffbe0b',
  dnd: '#ff4060',
  offline: '#404450',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UserNodeProps {
  userId: string;
  handle: string;
  avatarUrl?: string;
  /** Two-letter initials fallback */
  initials: string;
  /** Gradient colors for avatar background [from, to] */
  gradientColors: [string, string];
  /** Position as fraction of viewport (0-1) */
  x: number;
  y: number;
  /** Presence status */
  status: 'online' | 'idle' | 'dnd' | 'offline';
  /** Whether this user is muted */
  isMuted: boolean;
  /** Whether this user is currently speaking */
  isSpeaking: boolean;
  /** Whether this is the current user */
  isCurrentUser: boolean;
  /** Orbit color for the pulsing rings */
  orbitColor: string;
  /** Called on mouse enter with the event */
  onMouseEnter?: (e: React.MouseEvent) => void;
  /** Called on mouse move */
  onMouseMove?: (e: React.MouseEvent) => void;
  /** Called on mouse leave */
  onMouseLeave?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function UserNode({
  userId,
  handle,
  avatarUrl,
  initials,
  gradientColors,
  x,
  y,
  status,
  isMuted,
  isSpeaking,
  isCurrentUser,
  orbitColor,
  onMouseEnter,
  onMouseMove,
  onMouseLeave,
}: UserNodeProps) {
  const isOffline = status === 'offline';
  const statusColor = STATUS_COLOR[status];

  // Speaking overrides the "you" cyan border — both use cyan but speaking adds
  // a stronger glow and pulsing rings at a faster cadence.
  const showCyanBorder = isSpeaking || isCurrentUser;
  const showRings = !isOffline;

  return (
    <div
      className={clsx(
        // base layout
        'absolute flex flex-col items-center gap-[5px] cursor-pointer pointer-events-auto z-20',
        // hover handled via group + inline transform
        'group',
      )}
      style={{
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        transform: 'translate(-50%, -50%)',
        transition: 'transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
      }}
      data-user-id={userId}
      onMouseEnter={(e) => {
        // Scale on hover via inline style (CSS :hover doesn't mix well with
        // the translate(-50%,-50%) base transform when using Tailwind)
        (e.currentTarget as HTMLDivElement).style.transform =
          'translate(-50%, -50%) scale(1.1)';
        (e.currentTarget as HTMLDivElement).style.zIndex = '30';
        onMouseEnter?.(e);
      }}
      onMouseMove={onMouseMove}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform =
          'translate(-50%, -50%)';
        (e.currentTarget as HTMLDivElement).style.zIndex = '20';
        onMouseLeave?.();
      }}
    >
      {/* ── Avatar wrapper (relative for badges) ── */}
      <div className="relative">
        {/* Pulsing rings */}
        {showRings && (
          <>
            <div
              className={clsx(
                'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full',
                isSpeaking
                  ? 'animate-[speakPulse_0.7s_ease_infinite]'
                  : 'animate-[nRingPulse_3s_ease_infinite]',
              )}
              style={{
                width: '54px',
                height: '54px',
                borderWidth: '1.5px',
                borderStyle: 'solid',
                borderColor: isSpeaking ? '#00e5ff' : orbitColor,
              }}
            />
            <div
              className={clsx(
                'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full',
                isSpeaking
                  ? 'animate-[speakPulse_0.7s_ease_infinite]'
                  : 'animate-[nRingPulse_3s_ease_infinite]',
              )}
              style={{
                width: '68px',
                height: '68px',
                borderWidth: '1.5px',
                borderStyle: 'solid',
                borderColor: isSpeaking ? '#00e5ff' : orbitColor,
                opacity: 0.5,
                animationDelay: '0.4s',
              }}
            />
          </>
        )}

        {/* Avatar circle */}
        <div
          className={clsx(
            'relative w-[42px] h-[42px] rounded-full flex items-center justify-center',
            'font-display font-bold text-[14px]',
            'shadow-[0_4px_18px_rgba(0,0,0,0.5)]',
            isOffline && 'grayscale-[0.9] opacity-50',
          )}
          style={{
            background: avatarUrl
              ? undefined
              : `linear-gradient(135deg, ${gradientColors[0]}, ${gradientColors[1]})`,
            borderWidth: '2px',
            borderStyle: 'solid',
            borderColor: showCyanBorder
              ? '#00e5ff'
              : 'rgba(255, 255, 255, 0.1)',
            boxShadow: isSpeaking
              ? '0 0 22px rgba(0, 229, 255, 0.5)'
              : isCurrentUser
                ? '0 0 20px rgba(0, 229, 255, 0.4)'
                : '0 4px 18px rgba(0, 0, 0, 0.5)',
          }}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={handle}
              className="w-full h-full rounded-full object-cover"
              draggable={false}
            />
          ) : (
            <span className="select-none text-white/90">{initials}</span>
          )}

          {/* Status dot — bottom-right */}
          <span
            className="absolute bottom-0 right-0 w-[10px] h-[10px] rounded-full border-2 border-bg"
            style={{ backgroundColor: statusColor }}
          />

          {/* Mute badge — top-right */}
          {isMuted && (
            <span
              className="absolute -top-[3px] -right-[3px] w-[14px] h-[14px] rounded-full flex items-center justify-center"
              style={{ backgroundColor: '#ff4060' }}
            >
              {/* Tiny mute icon (slash line) */}
              <svg
                width="8"
                height="8"
                viewBox="0 0 8 8"
                fill="none"
                className="text-white"
              >
                <line
                  x1="1"
                  y1="1"
                  x2="7"
                  y2="7"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          )}
        </div>
      </div>

      {/* ── Name label (glass pill) ── */}
      <div
        className={clsx(
          'rounded-[5px] px-[7px] py-[2px] font-mono text-[10.5px] leading-tight whitespace-nowrap',
          'border border-border',
        )}
        style={{
          background: 'rgba(7, 9, 13, 0.88)',
        }}
      >
        <span className="text-white/80">{handle}</span>
        {isCurrentUser && (
          <span className="text-cyan ml-1 font-semibold">&larr; YOU</span>
        )}
      </div>
    </div>
  );
}
