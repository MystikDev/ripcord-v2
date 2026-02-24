/**
 * @module voice-indicator
 * Small inline badge rendered next to voice channels showing the current
 * participant count and/or a connected-status dot.
 */
'use client';

import clsx from 'clsx';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface VoiceIndicatorProps {
  /** Number of participants currently in the voice channel */
  participantCount: number;
  /** Whether the local user is connected to this voice channel */
  isConnected: boolean;
  /** Optional extra className */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Small indicator shown next to voice channels in the sidebar.
 * Displays a participant count badge and a green dot when the local user
 * is connected.
 */
export function VoiceIndicator({
  participantCount,
  isConnected,
  className,
}: VoiceIndicatorProps) {
  if (participantCount === 0 && !isConnected) return null;

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
        isConnected
          ? 'bg-success/20 text-success'
          : 'bg-surface-3 text-text-muted',
        className,
      )}
    >
      {/* Green dot when connected */}
      {isConnected && (
        <span className="h-1.5 w-1.5 rounded-full bg-success" />
      )}

      {/* Participant count */}
      {participantCount > 0 && (
        <span>{participantCount}</span>
      )}
    </span>
  );
}
