/**
 * @module screen-share-view
 * Renders the active screen-share track in a video element with a header
 * overlay. Supports multiple simultaneous streams via a switcher bar and
 * auto-fallback when the active stream ends. Includes audio routing through
 * the shared Web Audio graph, quality selector, custom pop-out panel (replaces
 * native PiP which breaks in WebView2), and live FPS overlay.
 */
'use client';

import { useTracks, useLocalParticipant } from '@livekit/components-react';
import { Track, VideoQuality, RemoteTrackPublication, RemoteAudioTrack } from 'livekit-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useVoiceStateStore } from '../../stores/voice-state-store';
import { useSettingsStore } from '../../stores/settings-store';
import { useMemberStore } from '../../stores/member-store';
import { getSharedAudioContext } from './voice-audio-renderer';
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
// Screen share audio entry (routed through shared Web Audio graph)
// ---------------------------------------------------------------------------

interface ScreenShareAudioEntry {
  stream: MediaStream;
  keepAlive: HTMLAudioElement;
  sourceNode: MediaStreamAudioSourceNode;
  gainNode: GainNode;
  trackId: string;
}

function cleanupScreenShareAudio(entry: ScreenShareAudioEntry): void {
  try {
    entry.keepAlive.pause();
    entry.keepAlive.srcObject = null;
    entry.gainNode.disconnect();
    entry.sourceNode.disconnect();
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Pop-out panel defaults
// ---------------------------------------------------------------------------

const POP_OUT_MIN_W = 320;
const POP_OUT_MIN_H = 200;
const POP_OUT_DEFAULT_W = 640;
const POP_OUT_DEFAULT_H = 400;

// ---------------------------------------------------------------------------
// PopOutPanel — draggable, resizable floating video panel
// ---------------------------------------------------------------------------

function PopOutPanel({
  screenTrack,
  sharerIdentity,
  onClose,
}: {
  screenTrack: Track;
  sharerIdentity: string;
  onClose: () => void;
}) {
  const popVideoRef = useRef<HTMLVideoElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Position: offset from initial position (center-right of viewport)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragStartRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  // Size
  const [size, setSize] = useState({ w: POP_OUT_DEFAULT_W, h: POP_OUT_DEFAULT_H });
  const resizeStartRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  // Attach track to pop-out video element
  useEffect(() => {
    const el = popVideoRef.current;
    if (!el || !screenTrack) return;
    screenTrack.attach(el);
    return () => {
      screenTrack.detach(el);
    };
  }, [screenTrack]);

  // Fullscreen from pop-out
  const handleFullscreen = useCallback(() => {
    const el = popVideoRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      el.requestFullscreen();
    }
  }, []);

  // ---- Drag handlers (same pattern as DmCallPanel) ----
  const handleDragStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        ox: dragOffset.x,
        oy: dragOffset.y,
      };
    },
    [dragOffset],
  );

  const handleDragMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragStartRef.current || !panelRef.current) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;

      let newX = dragStartRef.current.ox + dx;
      let newY = dragStartRef.current.oy + dy;

      // Constrain to viewport
      const rect = panelRef.current.getBoundingClientRect();
      const baseLeft = rect.left - dragOffset.x;
      const baseTop = rect.top - dragOffset.y;

      const minX = -baseLeft;
      const maxX = window.innerWidth - rect.width - baseLeft;
      const minY = -baseTop;
      const maxY = window.innerHeight - rect.height - baseTop;

      newX = Math.max(minX, Math.min(maxX, newX));
      newY = Math.max(minY, Math.min(maxY, newY));

      setDragOffset({ x: newX, y: newY });
    },
    [dragOffset],
  );

  const handleDragEnd = useCallback(() => {
    dragStartRef.current = null;
  }, []);

  // ---- Resize handlers ----
  const handleResizeStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      resizeStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        w: size.w,
        h: size.h,
      };
    },
    [size],
  );

  const handleResizeMove = useCallback((e: React.PointerEvent) => {
    if (!resizeStartRef.current) return;
    const dx = e.clientX - resizeStartRef.current.x;
    const dy = e.clientY - resizeStartRef.current.y;

    const newW = Math.max(POP_OUT_MIN_W, Math.min(window.innerWidth - 40, resizeStartRef.current.w + dx));
    const newH = Math.max(POP_OUT_MIN_H, Math.min(window.innerHeight - 40, resizeStartRef.current.h + dy));

    setSize({ w: newW, h: newH });
  }, []);

  const handleResizeEnd = useCallback(() => {
    resizeStartRef.current = null;
  }, []);

  // Initial position: center-right of viewport
  const initialLeft = Math.max(20, window.innerWidth - POP_OUT_DEFAULT_W - 40);
  const initialTop = Math.max(20, (window.innerHeight - POP_OUT_DEFAULT_H) / 2);

  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-[95] flex flex-col rounded-xl border-2 border-border bg-surface-2 shadow-2xl overflow-hidden"
      style={{
        left: initialLeft,
        top: initialTop,
        width: size.w,
        height: size.h,
        transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)`,
      }}
    >
      {/* Drag handle */}
      <div
        className="flex h-7 shrink-0 cursor-grab items-center justify-between rounded-t-xl bg-surface-3/60 px-2 active:cursor-grabbing"
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
      >
        <span className="text-[10px] font-medium text-text-muted truncate pointer-events-none select-none">
          <SharerName identity={sharerIdentity} />&apos;s screen
        </span>
        <div className="flex items-center gap-1 pointer-events-auto">
          {/* Fullscreen button */}
          <button
            onClick={handleFullscreen}
            className="flex items-center justify-center rounded p-0.5 text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors"
            title="Fullscreen"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" />
            </svg>
          </button>
          {/* Close button */}
          <button
            onClick={onClose}
            className="flex items-center justify-center rounded p-0.5 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
            title="Pop back in"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
      </div>

      {/* Video */}
      <video
        ref={popVideoRef}
        autoPlay
        playsInline
        onClick={handleFullscreen}
        className="min-h-0 flex-1 w-full object-contain bg-black cursor-pointer"
      />

      {/* Resize handle (bottom-right corner) */}
      <div
        className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize"
        onPointerDown={handleResizeStart}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeEnd}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" className="text-text-muted/40">
          <path d="M14 14L8 14M14 14L14 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M14 14L11 14M14 14L14 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Displays a selected screen-share track (or the first available) in a video
 * element. When multiple participants share simultaneously, renders a switcher
 * bar with tabs for each sharer. The local user always sees a "Stop Sharing"
 * button when they are sharing, regardless of which stream they're viewing.
 *
 * Screen share audio is routed through the shared AudioContext (same as voice
 * audio) so it respects EQ, speaker selection, and deafen.
 */
export function ScreenShareView() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioEntryRef = useRef<ScreenShareAudioEntry | null>(null);
  const { localParticipant } = useLocalParticipant();

  // Pop-out state
  const [isPoppedOut, setIsPoppedOut] = useState(false);

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
  const isDeafened = useSettingsStore((s) => s.isDeafened);

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
      // Close pop-out when no streams
      setIsPoppedOut(false);
      return;
    }
    const stillPresent = videoTracks.some((t) => t.participant.identity === activeScreenShareId);
    if (!stillPresent && activeScreenShareId !== null) {
      // Fall back to first available
      setActiveScreenShareId(videoTracks[0]?.participant?.identity ?? null);
    }
  }, [videoTracks, activeScreenShareId, setActiveScreenShareId]);

  // Attach / detach the video track (only when NOT popped out)
  useEffect(() => {
    if (isPoppedOut) return; // PopOutPanel manages its own video element
    const el = videoRef.current;
    if (!el || !screenTrack) return;

    screenTrack.attach(el);
    return () => {
      screenTrack.detach(el);
    };
  }, [screenTrack, isPoppedOut]);

  // Route screen share audio through the shared Web Audio graph.
  // Uses the same keep-alive pattern as VoiceAudioRenderer: a muted <audio>
  // element prevents Chromium from GC-ing the stream, while
  // createMediaStreamSource feeds audio into the Web Audio pipeline.
  useEffect(() => {
    if (!audioTrack || !(audioTrack instanceof RemoteAudioTrack)) {
      // No audio track — clean up any existing entry
      if (audioEntryRef.current) {
        cleanupScreenShareAudio(audioEntryRef.current);
        audioEntryRef.current = null;
      }
      return;
    }

    const mst = audioTrack.mediaStreamTrack;
    if (!mst || mst.readyState === 'ended') return;

    // Skip if already tracking the same underlying track
    if (audioEntryRef.current?.trackId === mst.id) return;

    // Clean up previous entry if track changed
    if (audioEntryRef.current) {
      cleanupScreenShareAudio(audioEntryRef.current);
      audioEntryRef.current = null;
    }

    const ctx = getSharedAudioContext();
    if (!ctx) return;

    // Resume if suspended
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    try {
      const stream = new MediaStream([mst]);

      // Keep-alive: muted <audio> prevents Chromium from GC-ing the stream
      const keepAlive = new Audio();
      keepAlive.srcObject = stream;
      keepAlive.muted = true;
      keepAlive.play().catch(() => {});

      const sourceNode = ctx.createMediaStreamSource(stream);
      const gainNode = ctx.createGain();
      gainNode.gain.value = isDeafened ? 0 : 1;

      // Connect directly to destination (bypasses per-user volume/effects
      // chain — screen share audio should play at normal volume)
      sourceNode.connect(gainNode);
      gainNode.connect(ctx.destination);

      audioEntryRef.current = { stream, keepAlive, sourceNode, gainNode, trackId: mst.id };
    } catch (err) {
      console.warn('[ScreenShareView] Failed to create audio entry:', err);
    }

    return () => {
      if (audioEntryRef.current) {
        cleanupScreenShareAudio(audioEntryRef.current);
        audioEntryRef.current = null;
      }
    };
  }, [audioTrack]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mute/unmute screen-share audio when self-deafened
  useEffect(() => {
    if (audioEntryRef.current) {
      audioEntryRef.current.gainNode.gain.value = isDeafened ? 0 : 1;
    }
  }, [isDeafened]);

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

  const handlePopOut = useCallback(() => {
    setIsPoppedOut((prev) => !prev);
  }, []);

  const handleStopSharing = useCallback(async () => {
    await localParticipant.setScreenShareEnabled(false);
  }, [localParticipant]);

  if (!screenTrack) return null;

  const multipleStreams = videoTracks.length > 1;

  return (
    <>
      {/* Pop-out panel (rendered via portal to document.body) */}
      {isPoppedOut && screenTrack && (
        <PopOutPanel
          screenTrack={screenTrack}
          sharerIdentity={sharerIdentity}
          onClose={() => setIsPoppedOut(false)}
        />
      )}

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
        <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between bg-gradient-to-b from-black/70 via-black/40 to-transparent px-3 py-2"
          style={multipleStreams ? { top: 0 } : undefined}
        >
          <span className="text-xs font-medium text-text-primary">
            <SharerName identity={sharerIdentity} />&apos;s screen
          </span>
          <div className="flex items-center gap-1.5">
            {/* Viewer controls: quality + pop out + fullscreen */}
            {!isLocalSharing && (
              <>
                <select
                  value={quality}
                  onChange={(e) => setViewerQuality(e.target.value as QualityOption)}
                  className="rounded-md bg-surface-3/80 px-1.5 py-0.5 text-[10px] font-medium text-text-secondary border border-border/50 outline-none cursor-pointer hover:bg-surface-3"
                >
                  <option value="720p">720p</option>
                  <option value="1080p">1080p</option>
                  <option value="Source">Source</option>
                </select>
                <button
                  onClick={handlePopOut}
                  className="flex items-center gap-1 rounded-md bg-surface-3/80 px-1.5 py-0.5 text-[10px] font-medium text-text-secondary border border-border/50 outline-none cursor-pointer hover:bg-surface-3 hover:text-text-primary transition-colors"
                  title={isPoppedOut ? 'Pop back in' : 'Pop out to floating window'}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="1" y="2" width="14" height="12" rx="1.5" />
                    <rect x="8" y="7" width="6" height="5" rx="1" fill="currentColor" stroke="none" />
                  </svg>
                  {isPoppedOut ? 'Pop In' : 'Pop Out'}
                </button>
                {!isPoppedOut && (
                  <button
                    onClick={handleFullscreen}
                    className="flex items-center gap-1 rounded-md bg-surface-3/80 px-1.5 py-0.5 text-[10px] font-medium text-text-secondary border border-border/50 outline-none cursor-pointer hover:bg-surface-3 hover:text-text-primary transition-colors"
                    title="Toggle fullscreen"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" />
                    </svg>
                    Fullscreen
                  </button>
                )}
              </>
            )}
            {/* Presenter controls: stop sharing */}
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
          </div>
        </div>

        {/* FPS overlay (only when inline) */}
        {!isPoppedOut && fps !== null && (
          <div className="absolute bottom-2 right-2 z-10 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-mono font-medium text-white/80 backdrop-blur-sm">
            {fps} fps
          </div>
        )}

        {/* Video — hidden when popped out, shown inline otherwise */}
        {isPoppedOut ? (
          <div className="flex items-center justify-center py-6 text-xs text-text-muted">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5">
              <rect x="1" y="2" width="14" height="12" rx="1.5" />
              <rect x="8" y="7" width="6" height="5" rx="1" fill="currentColor" stroke="none" />
            </svg>
            Popped out — click &quot;Pop In&quot; to return
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            onClick={handleFullscreen}
            className="w-full max-h-[70vh] object-contain bg-black cursor-pointer"
          />
        )}
      </div>
    </>
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
