/**
 * @module dm-call-panel
 * Draggable floating panel for active DM calls. Wraps LiveKit for WebRTC
 * audio/video, shows call status (ringing/active) with a duration timer,
 * renders local + remote video feeds, and provides camera toggle / hang-up
 * controls. Visible from any view as a fixed-position element.
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useTracks,
  useLocalParticipant,
} from '@livekit/components-react';
import { Room, Track, type RoomOptions } from 'livekit-client';
import { useCallStore, type CallStatus } from '../../stores/call-store';
import { useAuthStore } from '../../stores/auth-store';
import { getDmVoiceToken } from '../../lib/voice-api';
import { gateway } from '../../lib/gateway-client';
import clsx from 'clsx';

// Gateway opcodes for call signaling
const OP_CALL_END = 33;

const ROOM_OPTIONS: RoomOptions = {
  adaptiveStream: true,
  dynacast: true,
};

// ---------------------------------------------------------------------------
// Call Duration Timer
// ---------------------------------------------------------------------------

function CallTimer() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return (
    <span className="tabular-nums">
      {mins}:{secs.toString().padStart(2, '0')}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Video Feeds (must be rendered inside <LiveKitRoom>)
// ---------------------------------------------------------------------------

function VideoFeeds() {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const { localParticipant } = useLocalParticipant();

  // Get all camera tracks (subscribed)
  const cameraTracks = useTracks([Track.Source.Camera], {
    onlySubscribed: true,
  });

  // Local camera track
  const localCameraTrack = useMemo(() => {
    const pubs = Array.from(localParticipant.getTrackPublications().values());
    const cam = pubs.find((p) => p.source === Track.Source.Camera && p.track);
    return cam?.track ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localParticipant, cameraTracks]);

  // Remote camera track (first non-local participant)
  const remoteCameraTrack = useMemo(() => {
    const remote = cameraTracks.find(
      (t) => t.participant.identity !== localParticipant.identity,
    );
    return remote?.publication?.track ?? null;
  }, [cameraTracks, localParticipant.identity]);

  // Attach/detach local video
  useEffect(() => {
    const el = localVideoRef.current;
    if (!el || !localCameraTrack) return;
    localCameraTrack.attach(el);
    return () => {
      localCameraTrack.detach(el);
    };
  }, [localCameraTrack]);

  // Attach/detach remote video
  useEffect(() => {
    const el = remoteVideoRef.current;
    if (!el || !remoteCameraTrack) return;
    remoteCameraTrack.attach(el);
    return () => {
      remoteCameraTrack.detach(el);
    };
  }, [remoteCameraTrack]);

  const hasAnyVideo = !!localCameraTrack || !!remoteCameraTrack;
  if (!hasAnyVideo) return null;

  return (
    <div className="relative">
      {/* Remote video (large) */}
      {remoteCameraTrack ? (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="w-full bg-black object-contain"
          style={{ maxHeight: 220 }}
        />
      ) : (
        /* Placeholder when only local video exists */
        localCameraTrack && (
          <div
            className="flex w-full items-center justify-center bg-surface-3 text-xs text-text-muted"
            style={{ height: 120 }}
          >
            Waiting for video...
          </div>
        )
      )}

      {/* Local video (small PiP in bottom-right corner) */}
      {localCameraTrack && (
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted /* prevent audio echo */
          className="absolute bottom-2 right-2 h-20 w-28 rounded-md border border-border bg-black object-cover shadow-lg"
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Camera Toggle Button (must be rendered inside <LiveKitRoom>)
// ---------------------------------------------------------------------------

function CameraToggleButton() {
  const { localParticipant } = useLocalParticipant();
  const isVideoEnabled = useCallStore((s) => s.isVideoEnabled);
  const toggleVideo = useCallStore((s) => s.toggleVideo);

  const handleToggle = useCallback(async () => {
    const newState = !isVideoEnabled;
    try {
      await localParticipant.setCameraEnabled(newState);
      toggleVideo();
    } catch (err) {
      console.error('Failed to toggle camera:', err);
      // Don't update store if hardware access failed
    }
  }, [localParticipant, isVideoEnabled, toggleVideo]);

  return (
    <button
      onClick={() => void handleToggle()}
      className={clsx(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors',
        isVideoEnabled
          ? 'bg-surface-3 text-text-primary hover:bg-surface-2'
          : 'bg-surface-3 text-text-muted hover:bg-surface-2',
      )}
      title={isVideoEnabled ? 'Turn off camera' : 'Turn on camera'}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="1" y="3.5" width="10" height="9" rx="1.5" />
        <path d="M11 7l4-2.5v7L11 9" />
        {!isVideoEnabled && <path d="M1 1l14 14" strokeWidth="2" />}
      </svg>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Inner Content (status display + controls)
// ---------------------------------------------------------------------------

function DmCallContent({
  status,
  remoteHandle,
  onHangUp,
  error,
  isInsideLiveKit,
}: {
  status: CallStatus;
  remoteHandle: string;
  onHangUp: () => void;
  error: string | null;
  isInsideLiveKit?: boolean;
}) {
  return (
    <div className="flex flex-col">
      {/* Video feeds (only rendered inside LiveKitRoom) */}
      {isInsideLiveKit && <VideoFeeds />}

      <div className="flex items-center gap-3 p-3">
        {/* Phone icon — pulses when ringing, solid green when active */}
        <div
          className={clsx(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
            status === 'active' ? 'bg-success/20' : 'bg-accent/20 animate-pulse',
          )}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={status === 'active' ? 'text-success' : 'text-accent'}
          >
            <path d="M1.5 4.5a2 2 0 012-2h1.382a1 1 0 01.894.553l.723 1.447a1 1 0 01-.15 1.084l-.69.767a.5.5 0 00-.05.577 6.517 6.517 0 003.962 3.962.5.5 0 00.577-.05l.768-.69a1 1 0 011.084-.15l1.447.723a1 1 0 01.553.894V12.5a2 2 0 01-2 2A11.5 11.5 0 011.5 4.5z" />
          </svg>
        </div>

        {/* Call info */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text-primary">
            {remoteHandle}
          </p>
          <p className="text-xs text-text-muted">
            {error ? (
              <span className="text-danger">{error}</span>
            ) : status === 'ringing_outgoing' ? (
              'Ringing...'
            ) : status === 'active' ? (
              <CallTimer />
            ) : null}
          </p>
        </div>

        {/* Camera toggle (only when connected inside LiveKit) */}
        {isInsideLiveKit && status === 'active' && <CameraToggleButton />}

        {/* Hang up button */}
        <button
          onClick={onHangUp}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger text-white transition-colors hover:bg-danger/80"
          title="Hang up"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 010-1.36C3.15 8.99 7.33 7 12 7s8.85 1.99 11.71 4.72c.18.18.29.44.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28a11.27 11.27 0 00-2.67-1.85.996.996 0 01-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function DmCallPanel() {
  const status = useCallStore((s) => s.status);
  const callInfo = useCallStore((s) => s.callInfo);
  const endCall = useCallStore((s) => s.endCall);
  const isVideoEnabled = useCallStore((s) => s.isVideoEnabled);

  const [token, setToken] = useState<string | null>(null);
  const [livekitUrl, setLivekitUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const room = useMemo(() => new Room(ROOM_OPTIONS), []);
  const panelRef = useRef<HTMLDivElement>(null);

  // ---- Drag state ----
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStartRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  // Fetch LiveKit token when we need to connect to the room:
  // - Caller: on ringing_outgoing (connect immediately, wait for callee to join)
  // - Callee: on active (just accepted the call via IncomingCall overlay)
  useEffect(() => {
    if (!callInfo) return;
    if (status !== 'ringing_outgoing' && status !== 'active') return;
    if (token) return; // already have a token

    let cancelled = false;

    getDmVoiceToken(callInfo.channelId)
      .then((res) => {
        if (cancelled) return;
        setToken(res.token);
        setLivekitUrl(res.url);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to connect');
      });

    return () => {
      cancelled = true;
    };
  }, [status, callInfo, token]);

  // Reset local state when call ends
  useEffect(() => {
    if (status === 'idle') {
      setToken(null);
      setLivekitUrl(null);
      setError(null);
      setDragOffset({ x: 0, y: 0 });
    }
  }, [status]);

  // User clicks hang up — send signal and clean up
  const handleHangUp = useCallback(() => {
    if (callInfo) {
      const auth = useAuthStore.getState();
      gateway.send(OP_CALL_END, {
        roomId: callInfo.roomId,
        channelId: callInfo.channelId,
        fromUserId: auth.userId,
        toUserId: callInfo.remoteUserId,
      });
    }
    // Disconnect LiveKit room before clearing store state
    try {
      room.disconnect();
    } catch {
      /* ignore if already disconnected */
    }
    endCall();
  }, [callInfo, endCall, room]);

  // LiveKit room disconnected unexpectedly (server close, network failure)
  const handleRoomDisconnected = useCallback(() => {
    endCall();
  }, [endCall]);

  // ---- Drag handlers ----
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

  // Don't render when idle or for incoming ring (IncomingCall overlay handles that)
  if (status === 'idle' || status === 'ringing_incoming' || !callInfo) return null;

  const isLivekitReady = !!token && !!livekitUrl;
  const hasVideo = isVideoEnabled || (callInfo.withVideo ?? false);

  return (
    <div
      ref={panelRef}
      className={clsx(
        'fixed bottom-4 left-20 z-[90] rounded-xl border border-border bg-surface-2 shadow-2xl transition-[width] duration-200',
        hasVideo ? 'w-80' : 'w-72',
      )}
      style={{
        transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)`,
      }}
    >
      {/* Drag handle */}
      <div
        className="flex h-5 cursor-grab items-center justify-center rounded-t-xl bg-surface-3/50 active:cursor-grabbing"
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
      >
        <div className="h-1 w-8 rounded-full bg-text-muted/30" />
      </div>

      {isLivekitReady ? (
        <LiveKitRoom
          room={room}
          serverUrl={livekitUrl}
          token={token}
          connect={true}
          audio={true}
          video={isVideoEnabled}
          onDisconnected={handleRoomDisconnected}
        >
          <RoomAudioRenderer />
          <DmCallContent
            status={status}
            remoteHandle={callInfo.remoteHandle ?? 'User'}
            onHangUp={handleHangUp}
            error={error}
            isInsideLiveKit={true}
          />
        </LiveKitRoom>
      ) : (
        <DmCallContent
          status={status}
          remoteHandle={callInfo.remoteHandle ?? 'User'}
          onHangUp={handleHangUp}
          error={error}
          isInsideLiveKit={false}
        />
      )}
    </div>
  );
}
