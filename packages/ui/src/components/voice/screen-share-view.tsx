/**
 * @module screen-share-view
 * Renders the active screen-share track in a video element with a header
 * overlay. Supports multiple simultaneous streams via a switcher bar and
 * auto-fallback when the active stream ends.
 */
'use client';

import { useTracks, useLocalParticipant } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { useCallback, useEffect, useRef } from 'react';
import { useVoiceStateStore } from '../../stores/voice-state-store';
import { useMemberStore } from '../../stores/member-store';
import clsx from 'clsx';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Displays a selected screen-share track (or the first available) in a video
 * element. When multiple participants share simultaneously, renders a switcher
 * bar with tabs for each sharer. The local user always sees a "Stop Sharing"
 * button when they are sharing, regardless of which stream they're viewing.
 */
export function ScreenShareView() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { localParticipant } = useLocalParticipant();

  const tracks = useTracks([Track.Source.ScreenShare], {
    onlySubscribed: true,
  });

  const activeScreenShareId = useVoiceStateStore((s) => s.activeScreenShareId);
  const setActiveScreenShareId = useVoiceStateStore((s) => s.setActiveScreenShareId);

  // Find the track matching the active selection, fallback to first available
  const activeTrackRef =
    tracks.find((t) => t.participant.identity === activeScreenShareId) ?? tracks[0] ?? null;

  const screenTrack = activeTrackRef?.publication?.track ?? null;
  const sharerIdentity = activeTrackRef?.participant?.identity ?? 'Someone';
  const isLocalSharing = localParticipant.isScreenShareEnabled;

  // Auto-switch when the active stream ends (identity no longer in tracks)
  useEffect(() => {
    if (tracks.length === 0) {
      if (activeScreenShareId !== null) setActiveScreenShareId(null);
      return;
    }
    const stillPresent = tracks.some((t) => t.participant.identity === activeScreenShareId);
    if (!stillPresent && activeScreenShareId !== null) {
      // Fall back to first available
      setActiveScreenShareId(tracks[0]?.participant?.identity ?? null);
    }
  }, [tracks, activeScreenShareId, setActiveScreenShareId]);

  // Attach / detach the video track
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !screenTrack) return;

    screenTrack.attach(el);
    return () => {
      screenTrack.detach(el);
    };
  }, [screenTrack]);

  const handleFullscreen = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      el.requestFullscreen();
    }
  }, []);

  const handleStopSharing = useCallback(async () => {
    await localParticipant.setScreenShareEnabled(false);
  }, [localParticipant]);

  if (!screenTrack) return null;

  const multipleStreams = tracks.length > 1;

  return (
    <div className="relative rounded-lg overflow-hidden bg-surface-1 border border-border">
      {/* Stream switcher tabs (only shown when 2+ streams active) */}
      {multipleStreams && (
        <div className="flex items-center gap-1 bg-surface-2/80 px-2 py-1.5 border-b border-border">
          {tracks.map((t) => {
            const identity = t.participant.identity;
            const isActive = identity === sharerIdentity;
            return (
              <StreamTab
                key={identity}
                identity={identity}
                isActive={isActive}
                onClick={() => setActiveScreenShareId(identity)}
              />
            );
          })}
        </div>
      )}

      {/* Header overlay */}
      <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent px-3 py-2"
        style={multipleStreams ? { top: 0 } : undefined}
      >
        <span className="text-xs font-medium text-text-primary">
          <SharerName identity={sharerIdentity} />&apos;s screen
        </span>
        <div className="flex items-center gap-1.5">
          {/* Stop sharing — always visible when LOCAL user is sharing */}
          {isLocalSharing && (
            <button
              onClick={handleStopSharing}
              className="flex items-center gap-1 rounded-md bg-danger/80 px-2 py-0.5 text-[10px] font-medium text-white transition-colors hover:bg-danger"
              title="Stop sharing"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                <rect width="10" height="10" rx="1.5" />
              </svg>
              Stop
            </button>
          )}
          {/* Fullscreen */}
          <button
            onClick={handleFullscreen}
            className="rounded-md p-1 text-text-secondary hover:bg-surface-3/50 hover:text-text-primary transition-colors"
            title="Toggle fullscreen"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" />
            </svg>
          </button>
        </div>
      </div>

      {/* Video */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="w-full max-h-64 object-contain bg-black"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Resolves a participant identity to a display name via member cache. */
function SharerName({ identity }: { identity: string }) {
  const cachedHandle = useMemberStore((s) => s.members[identity]?.handle);
  return <>{cachedHandle ?? identity}</>;
}

/** A single tab in the stream switcher bar. */
function StreamTab({
  identity,
  isActive,
  onClick,
}: {
  identity: string;
  isActive: boolean;
  onClick: () => void;
}) {
  const cachedHandle = useMemberStore((s) => s.members[identity]?.handle);
  const name = cachedHandle ?? identity;

  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all',
        isActive
          ? 'bg-cyan/20 text-cyan ring-1 ring-cyan/50'
          : 'bg-surface-3 text-text-muted hover:bg-surface-2 hover:text-text-secondary',
      )}
    >
      {/* Small screen icon */}
      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
        <rect x="1" y="2" width="14" height="10" rx="1.5" />
        <path d="M5 15h6" />
        <path d="M8 12v3" />
      </svg>
      <span className="truncate max-w-[80px]">{name}</span>
    </button>
  );
}
