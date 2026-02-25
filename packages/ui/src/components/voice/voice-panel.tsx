/**
 * @module voice-panel
 * Main voice session manager rendered at the bottom of the ChannelSidebar.
 * Handles the full LiveKit lifecycle: fetches a voice token, wraps children
 * in a LiveKitRoom provider, and activates hooks for noise gate, speaker
 * restoration, speaking sync, screen-share sync, volume, and latency.
 * Displays either a "Join Voice" button or the active VoicePanelContent.
 */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { LiveKitRoom, RoomAudioRenderer } from '@livekit/components-react';
import { Room, RoomOptions, setLogLevel, LogLevel } from 'livekit-client';
import { useHubStore } from '../../stores/server-store';
import { useAuthStore } from '../../stores/auth-store';
import { useSettingsStore } from '../../stores/settings-store';
import { useVoiceStateStore } from '../../stores/voice-state-store';
import { getVoiceToken } from '../../lib/voice-api';
import { gateway } from '../../lib/gateway-client';
import { useNoiseGate } from '../../hooks/use-noise-gate';
import { useRestoreSpeaker } from '../../hooks/use-restore-speaker';
import { useSyncSpeaking } from '../../hooks/use-sync-speaking';
import { useSyncScreenSharing } from '../../hooks/use-sync-screen-sharing';
import { useApplyUserVolumes } from '../../hooks/use-apply-user-volumes';
import { useDeafenRemoteAudio } from '../../hooks/use-deafen-remote-audio';
import { VoiceControls } from './voice-controls';
import { ScreenShareView } from './screen-share-view';
import { StreamPreview } from './stream-preview';
import { SignalMeter } from './signal-meter';
import { useVoiceLatency } from '../../hooks/use-voice-latency';
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
  // Bridge LiveKit screen-share state to Zustand store for sidebar icons
  useSyncScreenSharing();
  // Apply per-user volume overrides from settings store to LiveKit tracks
  useApplyUserVolumes();
  // Mute/unmute all remote audio when self-deafened
  useDeafenRemoteAudio();
  // Poll WebRTC stats for voice latency
  const { latencyMs, quality } = useVoiceLatency();

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
          {connectionState === 'connected' && (
            <SignalMeter latencyMs={latencyMs} quality={quality} />
          )}
        </div>
        <span className="truncate text-xs text-text-muted max-w-[120px]">
          {channelName}
        </span>
      </div>

      {/* Screen share */}
      {connectionState === 'connected' && <ScreenShareView />}

      {/* Hover preview portal (rendered inside LiveKitRoom for track access) */}
      {connectionState === 'connected' && <StreamPreview />}

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
      useVoiceStateStore.getState().setConnectedChannelId(activeChannelId);

      // Optimistic local update — show ourselves in the sidebar immediately
      const auth = useAuthStore.getState();
      useVoiceStateStore.getState().addParticipant(activeChannelId, {
        userId: auth.userId!,
        handle: auth.handle ?? undefined,
        selfMute: false,
        selfDeaf: false,
        joinedAt: new Date().toISOString(),
      });

      // Notify gateway of voice join (echo will de-duplicate)
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

      // Optimistic local removal — hide from sidebar immediately
      useVoiceStateStore.getState().removeParticipant(voiceChannelId, auth.userId!);

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
    useVoiceStateStore.getState().setConnectedChannelId(null);
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

      // Optimistic local removal from old channel
      useVoiceStateStore.getState().removeParticipant(voiceChannelId, auth.userId!);

      gateway.send(23, {
        channelId: voiceChannelId,
        userId: auth.userId,
        action: 'leave',
      });
      setToken(null);
      setLivekitUrl(null);
      setVoiceChannelId(null);
      setPttEnabled(false);
      useVoiceStateStore.getState().setConnectedChannelId(null);
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
        useVoiceStateStore.getState().setConnectedChannelId(pendingVoiceJoin);

        const auth = useAuthStore.getState();

        // Optimistic local addition to new channel — appear in sidebar immediately
        useVoiceStateStore.getState().addParticipant(pendingVoiceJoin, {
          userId: auth.userId!,
          handle: auth.handle ?? undefined,
          selfMute: false,
          selfDeaf: false,
          joinedAt: new Date().toISOString(),
        });

        // Notify gateway (echo will de-duplicate via addParticipant filter)
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
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <rect x="5.5" y="1" width="5" height="8" rx="2.5" />
                <path d="M3 7.5a5 5 0 0 0 10 0" />
                <path d="M8 12v2.5" />
                <path d="M5.5 14.5h5" />
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
