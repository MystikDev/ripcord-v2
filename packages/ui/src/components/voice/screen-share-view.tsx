/**
 * @module screen-share-view
 * Renders the active screen-share track in a video element with a header
 * overlay. Supports multiple simultaneous streams via a switcher bar and
 * auto-fallback when the active stream ends. Includes audio track
 * subscription, quality selector, and live FPS overlay.
 */
'use client';

import { useTracks, useLocalParticipant } from '@livekit/components-react';
import { Track, VideoQuality, RemoteTrackPublication } from 'livekit-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useVoiceStateStore } from '../../stores/voice-state-store';
import { useSettingsStore } from '../../stores/settings-store';
import { useMemberStore } from '../../stores/member-store';
import clsx from 'clsx';

// ---------------------------------------------------------------------------
// Quality options
// ---------------------------------------------------------------------------

type QualityOption = '720p' | '1080p' | 'Source';

const QUALITY_MAP: Record<QualityOption, VideoQuality> = {
  '720p': VideoQuality.MEDIUM,
  '1080p': VideoQuality.HIGH,
  'Source': VideoQuality.HIGH,
};

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
  const audioRef = useRef<HTMLAudioElement>(null);
  const { localParticipant } = useLocalParticipant();

  // Subscribe to both video and audio screen share tracks
  const videoTracks = useTracks([Track.Source.ScreenShare], {
    onlySubscribed: true,
  });

  const audioTracks = useTracks([Track.Source.ScreenShareAudio], {
    onlySubscribed: true,
  });

  const activeScreenShareId = useVoiceStateStore((s) => s.activeScreenShareId);
  const setActiveScreenShareId = useVoiceStateStore((s) => s.setActiveScreenShareId);

  // Quality selector state (persisted in settings store)
  const quality = useSettingsStore((s) => s.screenShareViewerQuality);
  const setViewerQuality = useSettingsStore((s) => s.setScreenShareViewerQuality);

  // FPS overlay state
  const [fps, setFps] = useState<number | null>(null);

  // Find the track matching the active selection, fallback to first available
  const activeTrackRef =
    videoTracks.find((t) => t.participant.identity === activeScreenShareId) ?? videoTracks[0] ?? null;

  const screenTrack = activeTrackRef?.publication?.track ?? null;
  const screenPublication = activeTrackRef?.publication ?? null;
  const sharerIdentity = activeTrackRef?.participant?.identity ?? 'Someone';
  const isLocalSharing = localParticipant.isScreenShareEnabled;

  // Find matching audio track for the active sharer
  const activeAudioRef =
    audioTracks.find((t) => t.participant.identity === sharerIdentity);
  const audioTrack = activeAudioRef?.publication?.track ?? null;

  // Auto-switch when the active stream ends (identity no longer in tracks)
  useEffect(() => {
    if (videoTracks.length === 0) {
      if (activeScreenShareId !== null) setActiveScreenShareId(null);
      return;
    }
    const stillPresent = videoTracks.some((t) => t.participant.identity === activeScreenShareId);
    if (!stillPresent && activeScreenShareId !== null) {
      // Fall back to first available
      setActiveScreenShareId(videoTracks[0]?.participant?.identity ?? null);
    }
  }, [videoTracks, activeScreenShareId, setActiveScreenShareId]);

  // Attach / detach the video track
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !screenTrack) return;

    screenTrack.attach(el);
    return () => {
      screenTrack.detach(el);
    };
  }, [screenTrack]);

  // Attach / detach the audio track
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !audioTrack) return;

    audioTrack.attach(el);
    return () => {
      audioTrack.detach(el);
    };
  }, [audioTrack]);

  // Apply quality preference to the subscription
  useEffect(() => {
    if (!screenPublication) return;
    // setVideoQuality is only available on RemoteTrackPublication
    if (screenPublication instanceof RemoteTrackPublication) {
      try {
        screenPublication.setVideoQuality(QUALITY_MAP[quality]);
      } catch {
        // Silently ignore if quality setting fails
      }
    }
  }, [quality, screenPublication]);

  // FPS counter — poll WebRTC stats every second
  useEffect(() => {
    if (!screenTrack) {
      setFps(null);
      return;
    }

    let lastFrameCount = 0;
    let lastTimestamp = performance.now();

    const interval = setInterval(async () => {
      try {
        // Access the MediaStreamTrack to get frame stats
        const mediaTrack = screenTrack.mediaStreamTrack;
        if (!mediaTrack) return;

        // Use getStats on the track if available
        const settings = mediaTrack.getSettings?.();
        if (settings?.frameRate) {
          setFps(Math.round(settings.frameRate));
          return;
        }

        // Fallback: use requestVideoFrameCallback if available on the video element
        const el = videoRef.current;
        if (el && 'getVideoPlaybackQuality' in el) {
          const quality = (el as HTMLVideoElement).getVideoPlaybackQuality();
          const now = performance.now();
          const elapsed = (now - lastTimestamp) / 1000;
          if (elapsed > 0.5) {
            const frames = quality.totalVideoFrames - lastFrameCount;
            setFps(Math.round(frames / elapsed));
            lastFrameCount = quality.totalVideoFrames;
            lastTimestamp = now;
          }
        }
      } catch {
        // Stats not available — skip silently
      }
    }, 1000);

    return () => clearInterval(interval);
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

  const multipleStreams = videoTracks.length > 1;

  return (
    <div className="relative rounded-lg overflow-hidden bg-surface-1 border border-border">
      {/* Stream switcher tabs (only shown when 2+ streams active) */}
      {multipleStreams && (
        <div className="flex items-center gap-1 bg-surface-2/80 px-2 py-1.5 border-b border-border">
          {videoTracks.map((t) => {
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
          {/* Quality selector */}
          {!isLocalSharing && (
            <select
              value={quality}
              onChange={(e) => setViewerQuality(e.target.value as QualityOption)}
              className="rounded-md bg-surface-3/80 px-1.5 py-0.5 text-[10px] font-medium text-text-secondary border border-border/50 outline-none cursor-pointer hover:bg-surface-3"
            >
              <option value="720p">720p</option>
              <option value="1080p">1080p</option>
              <option value="Source">Source</option>
            </select>
          )}
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

      {/* FPS overlay */}
      {fps !== null && (
        <div className="absolute bottom-2 right-2 z-10 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-mono font-medium text-white/80 backdrop-blur-sm">
          {fps} fps
        </div>
      )}

      {/* Video */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="w-full max-h-64 object-contain bg-black"
      />

      {/* Hidden audio element for screen share audio */}
      <audio ref={audioRef} autoPlay />
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
