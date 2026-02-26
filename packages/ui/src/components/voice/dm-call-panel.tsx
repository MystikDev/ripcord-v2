/**
 * @module dm-call-panel
 * Floating panel for active DM calls. Wraps LiveKit for WebRTC audio,
 * shows call status (ringing/active) with a duration timer, and provides
 * a hang-up control. Renders as a fixed-position element visible from any view.
 */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { LiveKitRoom, RoomAudioRenderer } from '@livekit/components-react';
import { Room, type RoomOptions } from 'livekit-client';
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
// Inner Content (status display + controls)
// ---------------------------------------------------------------------------

function DmCallContent({
  status,
  remoteHandle,
  onHangUp,
  error,
}: {
  status: CallStatus;
  remoteHandle: string;
  onHangUp: () => void;
  error: string | null;
}) {
  return (
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
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function DmCallPanel() {
  const status = useCallStore((s) => s.status);
  const callInfo = useCallStore((s) => s.callInfo);
  const endCall = useCallStore((s) => s.endCall);

  const [token, setToken] = useState<string | null>(null);
  const [livekitUrl, setLivekitUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const room = useMemo(() => new Room(ROOM_OPTIONS), []);

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
    // The gateway CALL_END event may have already called endCall().
    // This is a safety net to ensure clean local state.
    endCall();
  }, [endCall]);

  // Don't render when idle or for incoming ring (IncomingCall overlay handles that)
  if (status === 'idle' || status === 'ringing_incoming' || !callInfo) return null;

  const isLivekitReady = !!token && !!livekitUrl;

  return (
    <div className="fixed bottom-4 left-20 z-[90] w-72 rounded-xl border border-border bg-surface-2 shadow-2xl">
      {isLivekitReady ? (
        <LiveKitRoom
          room={room}
          serverUrl={livekitUrl}
          token={token}
          connect={true}
          audio={true}
          video={false}
          onDisconnected={handleRoomDisconnected}
        >
          <RoomAudioRenderer />
          <DmCallContent
            status={status}
            remoteHandle={callInfo.remoteHandle ?? 'User'}
            onHangUp={handleHangUp}
            error={error}
          />
        </LiveKitRoom>
      ) : (
        <DmCallContent
          status={status}
          remoteHandle={callInfo.remoteHandle ?? 'User'}
          onHangUp={handleHangUp}
          error={error}
        />
      )}
    </div>
  );
}
