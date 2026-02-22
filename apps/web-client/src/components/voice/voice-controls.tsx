'use client';

import { useCallback } from 'react';
import { useLocalParticipant } from '@livekit/components-react';
import { usePushToTalk } from '@/hooks/use-push-to-talk';
import { useSettingsStore } from '@/stores/settings-store';
import { getKeyDisplayLabel } from '@/lib/key-display';
import { PttKeybindDialog } from '@/components/voice/ptt-keybind-dialog';
import { AudioSettings } from '@/components/voice/audio-settings';
import { Tooltip } from '@/components/ui/tooltip';
import clsx from 'clsx';

// ---------------------------------------------------------------------------
// Icon Components (inline SVGs to avoid extra deps)
// ---------------------------------------------------------------------------

function MicIcon({ muted }: { muted: boolean }) {
  if (muted) {
    return (
      <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 1a2 2 0 00-2 2v4a2 2 0 104 0V3a2 2 0 00-2-2z" />
        <path d="M2.7 2.7a1 1 0 011.4 0l9.2 9.2a1 1 0 01-1.4 1.4L2.7 4.1a1 1 0 010-1.4z" />
        <path d="M4 7a1 1 0 00-2 0 6 6 0 008.5 5.45l-1.5-1.5A4 4 0 014 7zM12 7a1 1 0 012 0 6.002 6.002 0 01-.5 2.45l-1.5-1.5A3.98 3.98 0 0012 7z" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 1a2 2 0 00-2 2v4a2 2 0 104 0V3a2 2 0 00-2-2zM4 7a1 1 0 00-2 0 6 6 0 0012 0 1 1 0 10-2 0 4 4 0 01-8 0zM7 13.93A6.004 6.004 0 012 8a1 1 0 10-2 0 8.003 8.003 0 007 7.93V15H6a1 1 0 100 2h4a1 1 0 100-2H9v-.07z" />
    </svg>
  );
}

function ScreenShareIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="1" y="2" width="14" height="10" rx="1.5" />
      <path d="M5 15h6" />
      <path d="M8 12v3" />
      {active && <path d="M5 7l3-3 3 3" fill="currentColor" stroke="none" />}
    </svg>
  );
}

function DisconnectIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1 1l14 14" />
      <path d="M4.5 4.5C3 5.5 2 7 2 8.5c0 .8.3 1.5.8 2L8 8M11.5 4.5c1.5 1 2.5 2.5 2.5 4 0 .8-.3 1.5-.8 2L8 8" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface VoiceControlsProps {
  /** Whether push-to-talk mode is enabled */
  pttEnabled: boolean;
  /** Toggle push-to-talk mode */
  onTogglePtt: () => void;
  /** Disconnect from the voice channel */
  onDisconnect: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VoiceControls({ pttEnabled, onTogglePtt, onDisconnect }: VoiceControlsProps) {
  const { localParticipant } = useLocalParticipant();
  const pttKey = useSettingsStore((s) => s.pttKey);

  const isMicMuted = !localParticipant.isMicrophoneEnabled;
  const isScreenSharing = localParticipant.isScreenShareEnabled;

  // ----- Mute / Unmute -----

  const toggleMic = useCallback(async () => {
    await localParticipant.setMicrophoneEnabled(isMicMuted);
  }, [localParticipant, isMicMuted]);

  // ----- Push-to-talk -----

  const handlePttActivate = useCallback(async () => {
    await localParticipant.setMicrophoneEnabled(true);
  }, [localParticipant]);

  const handlePttDeactivate = useCallback(async () => {
    await localParticipant.setMicrophoneEnabled(false);
  }, [localParticipant]);

  const { isActive: pttActive } = usePushToTalk({
    key: pttKey,
    enabled: pttEnabled,
    onActivate: handlePttActivate,
    onDeactivate: handlePttDeactivate,
  });

  // ----- Screen share -----

  const toggleScreenShare = useCallback(async () => {
    await localParticipant.setScreenShareEnabled(!isScreenSharing);
  }, [localParticipant, isScreenSharing]);

  // ----- Render -----

  return (
    <div className="flex items-center justify-center gap-1.5">
      {/* Mute / Unmute toggle */}
      <Tooltip content={isMicMuted ? 'Unmute' : 'Mute'} side="top">
        <button
          onClick={toggleMic}
          className={clsx(
            'flex h-9 w-9 items-center justify-center rounded-full transition-colors',
            isMicMuted
              ? 'bg-danger/20 text-danger hover:bg-danger/30'
              : 'bg-surface-3 text-text-secondary hover:bg-surface-2 hover:text-text-primary',
          )}
        >
          <MicIcon muted={isMicMuted} />
        </button>
      </Tooltip>

      {/* Push-to-talk toggle */}
      <Tooltip content={pttEnabled ? 'Disable Push-to-Talk' : `Enable Push-to-Talk (${getKeyDisplayLabel(pttKey)})`} side="top">
        <button
          onClick={onTogglePtt}
          className={clsx(
            'flex h-9 items-center gap-1 rounded-full px-3 text-xs font-medium transition-all',
            pttEnabled
              ? 'bg-cyan/20 text-cyan hover:bg-cyan/30'
              : 'bg-surface-3 text-text-muted hover:bg-surface-2 hover:text-text-secondary',
            pttActive && 'ring-2 ring-cyan animate-pulse',
          )}
        >
          PTT
          {pttActive && (
            <span className="h-1.5 w-1.5 rounded-full bg-cyan" />
          )}
        </button>
      </Tooltip>

      {/* PTT keybind changer (visible when PTT is enabled) */}
      {pttEnabled && <PttKeybindDialog />}

      {/* Screen share */}
      <Tooltip content={isScreenSharing ? 'Stop Sharing' : 'Share Screen'} side="top">
        <button
          onClick={toggleScreenShare}
          className={clsx(
            'flex h-9 w-9 items-center justify-center rounded-full transition-colors',
            isScreenSharing
              ? 'bg-success/20 text-success hover:bg-success/30'
              : 'bg-surface-3 text-text-secondary hover:bg-surface-2 hover:text-text-primary',
          )}
        >
          <ScreenShareIcon active={isScreenSharing} />
        </button>
      </Tooltip>

      {/* Audio settings */}
      <AudioSettings />

      {/* Disconnect */}
      <Tooltip content="Disconnect" side="top">
        <button
          onClick={onDisconnect}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-danger/20 text-danger hover:bg-danger/30 transition-colors"
        >
          <DisconnectIcon />
        </button>
      </Tooltip>
    </div>
  );
}
