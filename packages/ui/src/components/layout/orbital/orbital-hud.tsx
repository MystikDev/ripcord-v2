/**
 * @module orbital-hud
 * Bottom HUD bar for the orbital view. Displays (left to right): voice pill
 * with blinking dot and mini participant avatars, latency readout, spacer,
 * Comms Center (chat) toggle, centered COMMS button (opens audio controls
 * popover), and user pill. Fixed to the bottom edge with a gradient fade.
 */
'use client';

import { useState, useCallback } from 'react';
import clsx from 'clsx';
import { CommsPopover } from './comms-popover';
import { useHubStore } from '../../../stores/server-store';
import { BugReportButton } from '../../ui/bug-report-dialog';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrbitalHudProps {
  /** Currently connected voice channel name, null if not in voice */
  voiceChannelName: string | null;
  /** Mini avatars for voice participants */
  voiceParticipants: Array<{
    userId: string;
    initials: string;
    gradientColors: [string, string];
    isCurrentUser: boolean;
  }>;
  /** Latency in ms or null */
  latencyMs: number | null;
  /** Current user info */
  currentUser: {
    handle: string;
    initials: string;
    gradientColors: [string, string];
  };
  /** Mic muted state */
  isMicMuted: boolean;
  /** Deafened state */
  isDeafened: boolean;
  /** Screen sharing state */
  isScreenSharing: boolean;
  /** Callbacks */
  onMicToggle: () => void;
  onDeafenToggle: () => void;
  onDisconnect: () => void;
  onScreenShareToggle: () => void;
  /** Comms Center */
  commsCenterOpen: boolean;
  onCommsCenterToggle: () => void;
  /** Active text channel name for Comms Center label */
  activeTextChannelName: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a color string for latency: green (<80), yellow (<150), red (>=150) */
function latencyColor(ms: number): string {
  if (ms < 80) return '#34d399';
  if (ms < 150) return '#fbbf24';
  return '#f87171';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Blinking green dot for active voice connection */
function BlinkDot() {
  return (
    <span className="relative flex items-center justify-center w-[8px] h-[8px] shrink-0">
      <span
        className="absolute inset-0 rounded-full animate-ping"
        style={{ backgroundColor: '#34d399', opacity: 0.6 }}
      />
      <span
        className="relative w-[6px] h-[6px] rounded-full"
        style={{ backgroundColor: '#34d399' }}
      />
    </span>
  );
}

/** Mini avatar circle (20px) used in the voice pill participant row */
function MiniAvatar({
  initials,
  gradientColors,
  isCurrentUser,
  style,
}: {
  initials: string;
  gradientColors: [string, string];
  isCurrentUser: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={clsx(
        'w-[20px] h-[20px] rounded-full flex items-center justify-center',
        'text-[8px] font-mono font-bold select-none shrink-0',
      )}
      style={{
        background: `linear-gradient(135deg, ${gradientColors[0]}, ${gradientColors[1]})`,
        border: isCurrentUser ? '1.5px solid #00f0ff' : '1.5px solid rgba(255,255,255,0.15)',
        ...style,
      }}
    >
      <span className="text-white/90">{initials}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OrbitalHud({
  voiceChannelName,
  voiceParticipants,
  latencyMs,
  currentUser,
  isMicMuted,
  isDeafened,
  isScreenSharing,
  onMicToggle,
  onDeafenToggle,
  onDisconnect,
  onScreenShareToggle,
  commsCenterOpen,
  onCommsCenterToggle,
  activeTextChannelName,
}: OrbitalHudProps) {
  const [commsOpen, setCommsOpen] = useState(false);

  const toggleComms = useCallback(() => {
    setCommsOpen((prev) => !prev);
  }, []);

  const closeComms = useCallback(() => {
    setCommsOpen(false);
  }, []);

  const isInVoice = voiceChannelName !== null;
  const enterDmView = useHubStore((s) => s.enterDmView);

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-[200] flex items-center"
      style={{
        height: '54px',
        padding: '0 16px',
        gap: '10px',
        background: 'linear-gradient(to top, rgba(7, 9, 13, 0.98), rgba(7, 9, 13, 0))',
      }}
    >
      {/* ── 1. Voice Pill ── */}
      {isInVoice && (
        <div
          className={clsx(
            'flex items-center gap-2 px-2.5 py-1 rounded-full shrink-0',
            'border border-border',
          )}
          style={{ background: 'rgba(7, 9, 13, 0.85)' }}
        >
          <BlinkDot />
          <span className="font-mono text-[11px] text-success whitespace-nowrap">
            {voiceChannelName}
          </span>

          {/* Mini avatar stack */}
          {voiceParticipants.length > 0 && (
            <div className="flex items-center ml-1">
              {voiceParticipants.slice(0, 5).map((p, i) => (
                <MiniAvatar
                  key={p.userId}
                  initials={p.initials}
                  gradientColors={p.gradientColors}
                  isCurrentUser={p.isCurrentUser}
                  style={{
                    marginLeft: i === 0 ? 0 : '-5px',
                    zIndex: voiceParticipants.length - i,
                  }}
                />
              ))}
              {voiceParticipants.length > 5 && (
                <span className="ml-1 font-mono text-[9px] text-text-muted">
                  +{voiceParticipants.length - 5}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── 2. Latency ── */}
      {latencyMs !== null && (
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="font-mono text-[10px] tracking-[0.08em] uppercase text-text-muted">
            Latency:
          </span>
          <span
            className="font-mono text-[10px] font-bold"
            style={{ color: latencyColor(latencyMs) }}
          >
            {latencyMs}ms
          </span>
        </div>
      )}

      {/* ── 3. Left Spacer ── */}
      <div className="flex-1" />

      {/* ── 4. COMMS Button — centered (audio controls popover) ── */}
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={toggleComms}
          title="Audio Controls"
          className={clsx(
            'flex items-center gap-1.5 px-3 py-1 rounded-full',
            'font-mono text-[11px] transition-all duration-150',
            'border cursor-pointer',
            commsOpen
              ? 'border-cyan/40 bg-cyan/10 text-cyan'
              : isMicMuted || isDeafened
                ? 'border-red-500/30 bg-red-500/8 text-red-400 hover:bg-red-500/15'
                : 'border-border bg-white/3 text-text-secondary hover:text-text-primary hover:border-white/15',
          )}
        >
          {/* Headset icon */}
          <svg
            width="13"
            height="13"
            viewBox="0 0 14 14"
            fill="none"
            className="text-current shrink-0"
          >
            <path
              d="M2 8V7a5 5 0 0 1 10 0v1"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
            <rect
              x="1"
              y="8"
              width="2.5"
              height="4"
              rx="0.8"
              stroke="currentColor"
              strokeWidth="1.2"
            />
            <rect
              x="10.5"
              y="8"
              width="2.5"
              height="4"
              rx="0.8"
              stroke="currentColor"
              strokeWidth="1.2"
            />
          </svg>
          <span className="whitespace-nowrap">
            {isDeafened ? 'DEAFENED' : isMicMuted ? 'MUTED' : 'COMMS'}
          </span>
          {/* Status indicator dot */}
          {(isMicMuted || isDeafened) && (
            <span className="w-[5px] h-[5px] rounded-full bg-red-400 shrink-0" />
          )}
        </button>
        {/* Deafen indicator dot — absolute-positioned on button corner */}
        {isDeafened && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-400 rounded-full pointer-events-none" />
        )}

        {/* Popover */}
        <CommsPopover
          open={commsOpen}
          onClose={closeComms}
          voiceChannelName={voiceChannelName}
          latencyMs={latencyMs}
          isMicMuted={isMicMuted}
          isDeafened={isDeafened}
          isScreenSharing={isScreenSharing}
          onMicToggle={onMicToggle}
          onDeafenToggle={onDeafenToggle}
          onScreenShareToggle={onScreenShareToggle}
          onDisconnect={onDisconnect}
        />
      </div>

      {/* ── 4b. Disconnect shortcut — visible only when in voice ── */}
      {isInVoice && (
        <button
          type="button"
          onClick={onDisconnect}
          title="Disconnect from voice"
          className={clsx(
            'flex items-center justify-center w-[30px] h-[30px] rounded-full shrink-0',
            'border border-red-500/30 bg-red-500/10 text-red-400',
            'hover:bg-red-500/25 hover:border-red-500/50',
            'transition-all duration-150 cursor-pointer',
          )}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M1.5 6c1-2.5 3.5-4 5.5-4s4.5 1.5 5.5 4l-1.5 1.5c-.3.3-.7.3-1 .1L8.5 6.5a.5.5 0 0 1-.2-.4V4.5a6.3 6.3 0 0 0-2.6 0v1.6c0 .15-.07.3-.2.4L4 7.6c-.3.2-.7.2-1-.1L1.5 6Z"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}

      {/* ── 5. Right Spacer ── */}
      <div className="flex-1" />

      {/* ── 6. Friends / DMs ── */}
      <button
        type="button"
        onClick={enterDmView}
        title="Friends & Direct Messages"
        className={clsx(
          'flex items-center gap-1.5 px-3 py-1 rounded-full shrink-0',
          'font-mono text-[11px] transition-all duration-150',
          'border cursor-pointer',
          'border-border bg-white/3 text-text-secondary hover:text-text-primary hover:border-white/15',
        )}
      >
        {/* People icon */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          className="text-current shrink-0"
        >
          <circle cx="4" cy="3.5" r="2" stroke="currentColor" strokeWidth="1.2" />
          <path
            d="M0.5 10.5c0-2 1.5-3.5 3.5-3.5s3.5 1.5 3.5 3.5"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
          <circle cx="8.5" cy="3.5" r="1.5" stroke="currentColor" strokeWidth="1" />
          <path
            d="M7.5 10.5c0-1.5 1-2.5 2-3"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
          />
        </svg>
        <span className="whitespace-nowrap">Friends</span>
      </button>

      {/* ── 7. Comms Center Toggle (chat) ── */}
      <button
        type="button"
        onClick={onCommsCenterToggle}
        title="Toggle Chat Panel"
        className={clsx(
          'flex items-center gap-1.5 px-3 py-1 rounded-full shrink-0',
          'font-mono text-[11px] transition-all duration-150',
          'border cursor-pointer',
          commsCenterOpen
            ? 'border-cyan/40 bg-cyan/10 text-cyan'
            : 'border-border bg-white/3 text-text-secondary hover:text-text-primary hover:border-white/15',
        )}
      >
        {/* Chat icon */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          className="text-current shrink-0"
        >
          <path
            d="M2 2h8a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H5l-2 2V9H2a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="whitespace-nowrap">
          {activeTextChannelName ? `# ${activeTextChannelName}` : 'Comms Center'}
        </span>
      </button>

      {/* ── 7. User Pill ── */}
      <div
        role="button"
        tabIndex={0}
        onClick={onCommsCenterToggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onCommsCenterToggle(); }}
        title="Toggle Chat Panel"
        className={clsx(
          'flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-full shrink-0',
          'border border-border cursor-pointer',
          'hover:border-white/20 hover:bg-white/5 transition-all duration-150',
        )}
        style={{ background: 'rgba(7, 9, 13, 0.85)' }}
      >
        {/* Avatar (26px) */}
        <div
          className={clsx(
            'w-[26px] h-[26px] rounded-full flex items-center justify-center',
            'text-[10px] font-mono font-bold select-none shrink-0',
          )}
          style={{
            background: `linear-gradient(135deg, ${currentUser.gradientColors[0]}, ${currentUser.gradientColors[1]})`,
            border: '1.5px solid rgba(255, 255, 255, 0.15)',
          }}
        >
          <span className="text-white/90">{currentUser.initials}</span>
        </div>
        <span className="font-mono text-[11px] text-text-primary whitespace-nowrap">
          {currentUser.handle}
        </span>
      </div>

      {/* ── 8. Bug Report Icon ── */}
      <BugReportButton inline />
    </div>
  );
}
