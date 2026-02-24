/**
 * @module voice-controls
 * Bottom control bar for a voice session: mute toggle, push-to-talk toggle
 * with active pulse, inline PTT keybind dialog, screen-share toggle,
 * AudioSettings gear button, and a disconnect button.
 */
'use client';

import { useCallback } from 'react';
import { useLocalParticipant } from '@livekit/components-react';
import { usePushToTalk } from '../../hooks/use-push-to-talk';
import { useSettingsStore } from '../../stores/settings-store';
import { getKeyDisplayLabel } from '../../lib/key-display';
import { PttKeybindDialog } from './ptt-keybind-dialog';
import { AudioSettings } from './audio-settings';
import { Tooltip } from '../ui/tooltip';
import clsx from 'clsx';

// ---------------------------------------------------------------------------
// Icon Components (inline SVGs to avoid extra deps)
// ---------------------------------------------------------------------------

function MicIcon({ muted }: { muted: boolean }) {
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
      <rect x="5.5" y="1" width="5" height="8" rx="2.5" />
      <path d="M3 7.5a5 5 0 0 0 10 0" />
      <path d="M8 12v2.5" />
      <path d="M5.5 14.5h5" />
      {muted && <path d="M2 2l12 12" strokeWidth="2" />}
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
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 010-1.36C3.15 8.99 7.33 7 12 7s8.85 1.99 11.71 4.72c.18.18.29.44.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28a11.27 11.27 0 00-2.67-1.85.996.996 0 01-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
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
          className="flex h-9 w-9 items-center justify-center rounded-full bg-danger text-white hover:bg-danger/80 transition-colors"
        >
          <DisconnectIcon />
        </button>
      </Tooltip>
    </div>
  );
}
