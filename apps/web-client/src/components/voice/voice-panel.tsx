'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { LiveKitRoom, RoomAudioRenderer } from '@livekit/components-react';
import { Room, RoomOptions, setLogLevel, LogLevel } from 'livekit-client';
import { useHubStore } from '@/stores/server-store';
import { useAuthStore } from '@/stores/auth-store';
import { useSettingsStore } from '@/stores/settings-store';
import { getVoiceToken } from '@/lib/voice-api';
import { gateway } from '@/lib/gateway-client';
import { useNoiseGate } from '@/hooks/use-noise-gate';
import { useRestoreSpeaker } from '@/hooks/use-restore-speaker';
import { useSyncSpeaking } from '@/hooks/use-sync-speaking';
import { useApplyUserVolumes } from '@/hooks/use-apply-user-volumes';
import { VoiceControls } from './voice-controls';
import { ScreenShareView } from './screen-share-view';
import clsx from 'clsx';

// Suppress noisy LiveKit SDK internal errors (e.g. "Tried to add a track for
// a participant, that's not present") which are benign race conditions that the
// SDK resolves internally. Setting to 'warn' keeps useful diagnostics while
// preventing the Next.js dev overlay from catching these as red errors.
setLogLevel(LogLevel.warn);

// ---------------------------------------------------------------------------
// Room Options (shared across mounts)
// ---------------------------------------------------------------------------

const ROOM_OPTIONS: RoomOptions = {
  adaptiveStream: true,
  dynacast: true,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error';

// ---------------------------------------------------------------------------
// Connection Status Dot
// ---------------------------------------------------------------------------

function StatusDot({ state }: { state: ConnectionState }) {
  const color: Record<ConnectionState, string> = {
    idle: 'bg-text-muted',
    connecting: 'bg-warning animate-pulse',
    connected: 'bg-success',
    error: 'bg-danger',
  };

  return <span className={clsx('inline-block h-2 w-2 rounded-full', color[state])} />;
}

// ---------------------------------------------------------------------------
// Inner content (rendered inside LiveKitRoom context)
// ---------------------------------------------------------------------------

function VoicePanelContent({
  channelName,
  connectionState,
  pttEnabled,
  onTogglePtt,
  onDisconnect,
}: {
  channelName: string;
  connectionState: ConnectionState;
  pttEnabled: boolean;
  onTogglePtt: () => void;
  onDisconnect: () => void;
}) {
  // Activate noise-gate processor based on user settings
  useNoiseGate();
  // Restore saved speaker (output) device on connect
  useRestoreSpeaker();
  // Bridge LiveKit speaking state to Zustand store for sidebar indicators
  useSyncSpeaking();
  // Apply per-user volume overrides from settings store to LiveKit tracks
  useApplyUserVolumes();

  return (
    <div className="flex flex-col gap-2 p-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusDot state={connectionState} />
          <span className="text-xs font-medium text-text-secondary">
            {connectionState === 'connected'
              ? 'Voice Connected'
              : connectionState === 'connecting'
                ? 'Connecting...'
                : connectionState === 'error'
                  ? 'Connection Error'
                  : 'Not Connected'}
          </span>
        </div>
        <span className="truncate text-xs text-text-muted max-w-[120px]">
          {channelName}
        </span>
      </div>

      {/* Screen share */}
      {connectionState === 'connected' && <ScreenShareView />}

      {/* Controls */}
      {connectionState === 'connected' && (
        <VoiceControls
          pttEnabled={pttEnabled}
          onTogglePtt={onTogglePtt}
          onDisconnect={onDisconnect}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Voice Panel
// ---------------------------------------------------------------------------

export function VoicePanel() {
  const activeChannelId = useHubStore((s) => s.activeChannelId);
  const channels = useHubStore((s) => s.channels);
  const pendingVoiceJoin = useHubStore((s) => s.pendingVoiceJoin);
  const setPendingVoiceJoin = useHubStore((s) => s.setPendingVoiceJoin);
  const savedMicId = useSettingsStore((s) => s.selectedMicDeviceId);

  const [voiceChannelId, setVoiceChannelId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [livekitUrl, setLivekitUrl] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [pttEnabled, setPttEnabled] = useState(false);

  // Create a stable Room instance so LiveKit reuses connections cleanly
  const room = useMemo(() => new Room(ROOM_OPTIONS), []);

  const activeChannel = channels.find((c) => c.id === activeChannelId);
  const voiceChannel = channels.find((c) => c.id === voiceChannelId);
  const isVoiceChannel = activeChannel?.type === 'voice';

  // ----- Join -----

  const handleJoin = useCallback(async () => {
    if (!activeChannelId || !isVoiceChannel) return;

    setConnectionState('connecting');
    setError(null);

    try {
      const { token: t, url } = await getVoiceToken(activeChannelId);
      setToken(t);
      setLivekitUrl(url);
      setVoiceChannelId(activeChannelId);
      setConnectionState('connected');

      // Notify gateway of voice join
      const auth = useAuthStore.getState();
      gateway.send(23, {
        channelId: activeChannelId,
        userId: auth.userId,
        handle: auth.handle,
        action: 'join',
        selfMute: false,
        selfDeaf: false,
      });
    } catch (err) {
      setConnectionState('error');
      setError(err instanceof Error ? err.message : 'Failed to connect');
    }
  }, [activeChannelId, isVoiceChannel]);

  // ----- Leave -----

  const handleDisconnect = useCallback(() => {
    // Notify gateway of voice leave before clearing state
    if (voiceChannelId) {
      const auth = useAuthStore.getState();
      gateway.send(23, {
        channelId: voiceChannelId,
        userId: auth.userId,
        action: 'leave',
      });
    }

    setToken(null);
    setLivekitUrl(null);
    setVoiceChannelId(null);
    setConnectionState('idle');
    setError(null);
    setPttEnabled(false);
  }, [voiceChannelId]);

  // ----- Room callbacks -----

  const handleRoomDisconnected = useCallback(() => {
    handleDisconnect();
  }, [handleDisconnect]);

  const handleRoomError = useCallback((err: Error) => {
    console.error('[VoicePanel] Room error:', err);
    setConnectionState('error');
    setError(err.message);
  }, []);

  const handleRoomConnected = useCallback(() => {
    setConnectionState('connected');
  }, []);

  // ----- PTT toggle -----

  const handleTogglePtt = useCallback(() => {
    setPttEnabled((prev) => !prev);
  }, []);

  // ----- Auto-join on double-click signal -----
  // NOTE: We inline the join logic here instead of calling handleJoin() to
  // avoid a stale-closure bug. handleJoin captures activeChannelId from the
  // previous render, but pendingVoiceJoin already IS the correct channel ID.

  useEffect(() => {
    if (!pendingVoiceJoin) return;
    setPendingVoiceJoin(null); // consume the signal immediately

    // Don't interrupt an in-flight connection
    if (connectionState === 'connecting') return;

    const pendingChannel = channels.find((c) => c.id === pendingVoiceJoin);
    if (pendingChannel?.type !== 'voice') return;

    // Already in this channel — nothing to do
    if (voiceChannelId === pendingVoiceJoin && connectionState === 'connected') return;

    // If connected to a different channel, disconnect first
    if (voiceChannelId && connectionState === 'connected') {
      const auth = useAuthStore.getState();
      gateway.send(23, {
        channelId: voiceChannelId,
        userId: auth.userId,
        action: 'leave',
      });
      setToken(null);
      setLivekitUrl(null);
      setVoiceChannelId(null);
      setPttEnabled(false);
    }

    // Join the new channel
    setConnectionState('connecting');
    setError(null);

    getVoiceToken(pendingVoiceJoin)
      .then(({ token: t, url }) => {
        setToken(t);
        setLivekitUrl(url);
        setVoiceChannelId(pendingVoiceJoin);
        setConnectionState('connected');

        const auth = useAuthStore.getState();
        gateway.send(23, {
          channelId: pendingVoiceJoin,
          userId: auth.userId,
          handle: auth.handle,
          action: 'join',
          selfMute: false,
          selfDeaf: false,
        });
      })
      .catch((err: unknown) => {
        setConnectionState('error');
        setError(err instanceof Error ? err.message : 'Failed to connect');
      });
  }, [pendingVoiceJoin, setPendingVoiceJoin, connectionState, channels, voiceChannelId]);

  // ----- Not connected: show Join button if on a voice channel -----

  const isConnected = connectionState !== 'idle' && token && livekitUrl;

  return (
    <div className="border-t border-border bg-surface-1/80">
      {/* Connected: render LiveKitRoom wrapper */}
      {isConnected && (
        <LiveKitRoom
          room={room}
          serverUrl={livekitUrl}
          token={token}
          connect={true}
          audio={pttEnabled ? false : savedMicId ? { deviceId: savedMicId } : true}
          video={false}
          onDisconnected={handleRoomDisconnected}
          onError={handleRoomError}
          onConnected={handleRoomConnected}
        >
          <RoomAudioRenderer />
          <VoicePanelContent
            channelName={voiceChannel?.name ?? 'Voice'}
            connectionState={connectionState}
            pttEnabled={pttEnabled}
            onTogglePtt={handleTogglePtt}
            onDisconnect={handleDisconnect}
          />
        </LiveKitRoom>
      )}

      {/* Not connected: show join button or status */}
      {!isConnected && (
        <div className="flex flex-col items-center gap-2 p-3">
          {isVoiceChannel && connectionState === 'idle' && (
            <button
              onClick={handleJoin}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-success/20 px-3 py-2 text-sm font-medium text-success transition-colors hover:bg-success/30"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="shrink-0">
                <path d="M8 1a2 2 0 00-2 2v4a2 2 0 104 0V3a2 2 0 00-2-2zM4 7a1 1 0 00-2 0 6 6 0 0012 0 1 1 0 10-2 0 4 4 0 01-8 0zM7 13.93A6.004 6.004 0 012 8a1 1 0 10-2 0 8.003 8.003 0 007 7.93V15H6a1 1 0 100 2h4a1 1 0 100-2H9v-.07z" />
              </svg>
              Join Voice
            </button>
          )}

          {connectionState === 'connecting' && (
            <p className="text-xs text-warning animate-pulse">Connecting...</p>
          )}

          {connectionState === 'error' && (
            <div className="flex flex-col items-center gap-1">
              <p className="text-xs text-danger">{error ?? 'Connection failed'}</p>
              <button
                onClick={handleJoin}
                className="text-xs text-text-muted hover:text-text-secondary transition-colors"
              >
                Retry
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
