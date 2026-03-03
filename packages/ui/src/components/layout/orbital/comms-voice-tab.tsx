/**
 * @module comms-voice-tab
 * Voice controls tab for the Comms Center floating panel. Renders entirely
 * from Zustand stores — no LiveKit hooks needed. Voice actions are bridged
 * through callback functions registered by VoiceControls inside LiveKitRoom.
 *
 * Sections: Voice Status, Push-to-Talk, Screen Share, Audio Devices,
 * Audio Processing (noise suppression + EQ).
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useVoiceStateStore } from '../../../stores/voice-state-store';
import { useSettingsStore } from '../../../stores/settings-store';
import { useHubStore } from '../../../stores/server-store';
import { PttKeybindDialog } from '../../voice/ptt-keybind-dialog';
import { ScreenShareSettings, type ScreenShareOptions } from '../../voice/screen-share-settings';
import { getKeyDisplayLabel } from '../../../lib/key-display';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function latencyColor(ms: number): string {
  if (ms < 80) return '#34d399';
  if (ms < 150) return '#fbbf24';
  return '#f87171';
}

function latencyLabel(ms: number): string {
  if (ms < 80) return 'Good';
  if (ms < 150) return 'Fair';
  return 'Poor';
}

// ---------------------------------------------------------------------------
// Audio Device Selector (standalone — no LiveKit hook needed)
// ---------------------------------------------------------------------------

function DeviceSelector({
  label,
  kind,
  selectedId,
  onSelect,
}: {
  label: string;
  kind: 'audioinput' | 'audiooutput';
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    let cancelled = false;
    const enumerate = async () => {
      try {
        const all = await navigator.mediaDevices.enumerateDevices();
        if (!cancelled) {
          setDevices(all.filter((d) => d.kind === kind));
        }
      } catch {
        // Permission denied or no devices
      }
    };
    enumerate();
    navigator.mediaDevices.addEventListener('devicechange', enumerate);
    return () => {
      cancelled = true;
      navigator.mediaDevices.removeEventListener('devicechange', enumerate);
    };
  }, [kind]);

  return (
    <div style={{ marginBottom: 8 }}>
      <label
        style={{
          display: 'block',
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: 9,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          color: 'rgba(255, 255, 255, 0.4)',
          marginBottom: 4,
        }}
      >
        {label}
      </label>
      <select
        value={selectedId ?? ''}
        onChange={(e) => onSelect(e.target.value || null)}
        style={{
          width: '100%',
          padding: '5px 8px',
          borderRadius: 6,
          border: '1px solid rgba(255, 255, 255, 0.1)',
          background: 'rgba(255, 255, 255, 0.05)',
          color: 'rgba(255, 255, 255, 0.85)',
          fontSize: 11,
          fontFamily: 'var(--font-mono, monospace)',
          outline: 'none',
          cursor: 'pointer',
        }}
      >
        <option value="">System Default</option>
        {devices.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || `${kind === 'audioinput' ? 'Microphone' : 'Speaker'} ${d.deviceId.slice(0, 8)}`}
          </option>
        ))}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section Header
// ---------------------------------------------------------------------------

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-mono, monospace)',
        fontSize: 9,
        textTransform: 'uppercase',
        letterSpacing: '0.14em',
        color: 'rgba(255, 255, 255, 0.35)',
        padding: '8px 12px 4px',
      }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CommsVoiceTab() {
  // -- Voice state (via Zustand bridge) --
  const connectedChannelId = useVoiceStateStore((s) => s.connectedChannelId);
  const latencyMs = useVoiceStateStore((s) => s.latencyMs);
  const localMicMuted = useVoiceStateStore((s) => s.localMicMuted);
  const pttActive = useVoiceStateStore((s) => s.pttActive);
  const localScreenSharing = useVoiceStateStore((s) => s.localScreenSharing);
  const toggleMicFn = useVoiceStateStore((s) => s.toggleMicFn);
  const toggleScreenShareFn = useVoiceStateStore((s) => s.toggleScreenShareFn);
  const startScreenShareFn = useVoiceStateStore((s) => s.startScreenShareFn);

  // -- Settings store --
  const pttEnabled = useSettingsStore((s) => s.pttEnabled);
  const togglePtt = useSettingsStore((s) => s.togglePtt);
  const pttKey = useSettingsStore((s) => s.pttKey);
  const isDeafened = useSettingsStore((s) => s.isDeafened);
  const toggleDeafen = useSettingsStore((s) => s.toggleDeafen);
  const selectedMicDeviceId = useSettingsStore((s) => s.selectedMicDeviceId);
  const setSelectedMicDeviceId = useSettingsStore((s) => s.setSelectedMicDeviceId);
  const selectedSpeakerDeviceId = useSettingsStore((s) => s.selectedSpeakerDeviceId);
  const setSelectedSpeakerDeviceId = useSettingsStore((s) => s.setSelectedSpeakerDeviceId);
  const noiseSuppressionEnabled = useSettingsStore((s) => s.noiseSuppressionEnabled);
  const setNoiseSuppressionEnabled = useSettingsStore((s) => s.setNoiseSuppressionEnabled);
  const noiseSuppressionStrength = useSettingsStore((s) => s.noiseSuppressionStrength);
  const setNoiseSuppressionStrength = useSettingsStore((s) => s.setNoiseSuppressionStrength);
  const eqEnabled = useSettingsStore((s) => s.eqEnabled);
  const setEqEnabled = useSettingsStore((s) => s.setEqEnabled);
  const eqBass = useSettingsStore((s) => s.eqBass);
  const setEqBass = useSettingsStore((s) => s.setEqBass);
  const eqMid = useSettingsStore((s) => s.eqMid);
  const setEqMid = useSettingsStore((s) => s.setEqMid);
  const eqTreble = useSettingsStore((s) => s.eqTreble);
  const setEqTreble = useSettingsStore((s) => s.setEqTreble);

  // -- Channel name from store --
  const channels = useHubStore((s) => s.channels);
  const channelName = connectedChannelId
    ? channels.find((c) => c.id === connectedChannelId)?.name ?? null
    : null;

  const isInVoice = connectedChannelId !== null;

  // -- Screen share settings dialog --
  const [showShareSettings, setShowShareSettings] = useState(false);

  const handleStartShare = useCallback(
    async (options: ScreenShareOptions) => {
      setShowShareSettings(false);
      if (startScreenShareFn) {
        await startScreenShareFn(options);
      }
    },
    [startScreenShareFn],
  );

  const handleScreenShareToggle = useCallback(() => {
    if (localScreenSharing) {
      toggleScreenShareFn?.();
    } else {
      setShowShareSettings(true);
    }
  }, [localScreenSharing, toggleScreenShareFn]);

  // -- Disconnect --
  const setPendingVoiceJoin = useHubStore((s) => s.setPendingVoiceJoin);
  const setConnectedChannelId = useVoiceStateStore((s) => s.setConnectedChannelId);
  const handleDisconnect = useCallback(() => {
    setPendingVoiceJoin(null);
    setConnectedChannelId(null);
  }, [setPendingVoiceJoin, setConnectedChannelId]);

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        userSelect: 'text',
      }}
    >
      {/* ═══ Voice Status ═══ */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
        {isInVoice ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#34d399',
                  flexShrink: 0,
                }}
              />
              <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11, color: '#34d399' }}>
                {channelName}
              </span>
            </div>
            {latencyMs !== null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 9, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  Latency
                </span>
                <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, fontWeight: 700, color: latencyColor(latencyMs) }}>
                  {latencyMs}ms
                </span>
                <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 9, color: latencyColor(latencyMs), opacity: 0.7 }}>
                  ({latencyLabel(latencyMs)})
                </span>
              </div>
            )}
          </>
        ) : (
          <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11, color: 'rgba(255, 255, 255, 0.35)' }}>
            Not connected to voice
          </span>
        )}
      </div>

      {/* ═══ Quick Controls ═══ */}
      {isInVoice && (
        <div
          style={{
            display: 'flex',
            gap: 4,
            padding: '8px 12px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          {/* Mic toggle */}
          <button
            type="button"
            onClick={() => toggleMicFn?.()}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '6px 0',
              borderRadius: 6,
              border: 'none',
              background: localMicMuted ? 'rgba(248, 113, 113, 0.12)' : 'rgba(255, 255, 255, 0.06)',
              color: localMicMuted ? '#f87171' : 'rgba(255, 255, 255, 0.7)',
              fontSize: 10,
              fontFamily: 'var(--font-mono, monospace)',
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
              <rect x="5" y="1" width="4" height="8" rx="2" stroke="currentColor" strokeWidth="1.3" />
              <path d="M3 6.5a4 4 0 0 0 8 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              <line x1="7" y1="11" x2="7" y2="13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              {localMicMuted && <line x1="2" y1="12" x2="12" y2="2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />}
            </svg>
            {localMicMuted ? 'Muted' : 'Mic'}
          </button>

          {/* Deafen toggle */}
          <button
            type="button"
            onClick={toggleDeafen}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '6px 0',
              borderRadius: 6,
              border: 'none',
              background: isDeafened ? 'rgba(248, 113, 113, 0.12)' : 'rgba(255, 255, 255, 0.06)',
              color: isDeafened ? '#f87171' : 'rgba(255, 255, 255, 0.7)',
              fontSize: 10,
              fontFamily: 'var(--font-mono, monospace)',
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
              <path d="M3 5.5v3a1 1 0 0 0 1 1h1l3 2.5V3L5 5.5H4a1 1 0 0 0-1 1Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
              {isDeafened && <line x1="2" y1="12" x2="12" y2="2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />}
            </svg>
            {isDeafened ? 'Deaf' : 'Audio'}
          </button>

          {/* Disconnect */}
          <button
            type="button"
            onClick={handleDisconnect}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              padding: '6px 0',
              borderRadius: 6,
              border: 'none',
              background: 'rgba(248, 113, 113, 0.12)',
              color: '#f87171',
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 010-1.36C3.15 8.99 7.33 7 12 7s8.85 1.99 11.71 4.72c.18.18.29.44.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28a11.27 11.27 0 00-2.67-1.85.996.996 0 01-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
            </svg>
          </button>
        </div>
      )}

      {/* ═══ Push-to-Talk ═══ */}
      <SectionHeader>Push-to-Talk</SectionHeader>
      <div style={{ padding: '4px 12px 8px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11, color: 'rgba(255, 255, 255, 0.7)' }}>
            {pttEnabled ? 'Enabled' : 'Disabled'}
          </span>
          {/* Toggle switch */}
          <button
            type="button"
            onClick={togglePtt}
            style={{
              width: 32,
              height: 18,
              borderRadius: 9,
              border: 'none',
              background: pttEnabled ? '#00e5ff' : 'rgba(255, 255, 255, 0.15)',
              cursor: 'pointer',
              position: 'relative',
              transition: 'background 0.2s',
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: 2,
                left: pttEnabled ? 16 : 2,
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: 'white',
                transition: 'left 0.2s',
              }}
            />
          </button>
        </div>
        {pttEnabled && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, color: 'rgba(255, 255, 255, 0.4)' }}>
              Key: {getKeyDisplayLabel(pttKey)}
            </span>
            {pttActive && (
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#00e5ff',
                  boxShadow: '0 0 8px rgba(0, 229, 255, 0.6)',
                  animation: 'pulse 1s infinite',
                }}
              />
            )}
            <PttKeybindDialog />
          </div>
        )}
      </div>

      {/* ═══ Screen Share ═══ */}
      {isInVoice && (
        <>
          <SectionHeader>Screen Share</SectionHeader>
          <div style={{ padding: '4px 12px 8px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <button
              type="button"
              onClick={handleScreenShareToggle}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '7px 0',
                borderRadius: 6,
                border: 'none',
                background: localScreenSharing ? 'rgba(52, 211, 153, 0.12)' : 'rgba(255, 255, 255, 0.06)',
                color: localScreenSharing ? '#34d399' : 'rgba(255, 255, 255, 0.7)',
                fontSize: 11,
                fontFamily: 'var(--font-mono, monospace)',
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="2" width="14" height="10" rx="1.5" />
                <path d="M5 15h6" />
                <path d="M8 12v3" />
              </svg>
              {localScreenSharing ? 'Stop Sharing' : 'Start Share'}
            </button>
          </div>
        </>
      )}

      {/* ═══ Audio Devices ═══ */}
      <SectionHeader>Audio Devices</SectionHeader>
      <div style={{ padding: '4px 12px 8px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
        <DeviceSelector
          label="Microphone"
          kind="audioinput"
          selectedId={selectedMicDeviceId}
          onSelect={setSelectedMicDeviceId}
        />
        <DeviceSelector
          label="Speaker"
          kind="audiooutput"
          selectedId={selectedSpeakerDeviceId}
          onSelect={setSelectedSpeakerDeviceId}
        />
      </div>

      {/* ═══ Audio Processing ═══ */}
      <SectionHeader>Audio Processing</SectionHeader>
      <div style={{ padding: '4px 12px 12px' }}>
        {/* Noise suppression */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, color: 'rgba(255, 255, 255, 0.6)' }}>
            Noise Gate
          </span>
          <button
            type="button"
            onClick={() => setNoiseSuppressionEnabled(!noiseSuppressionEnabled)}
            style={{
              width: 32,
              height: 18,
              borderRadius: 9,
              border: 'none',
              background: noiseSuppressionEnabled ? '#00e5ff' : 'rgba(255, 255, 255, 0.15)',
              cursor: 'pointer',
              position: 'relative',
              transition: 'background 0.2s',
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: 2,
                left: noiseSuppressionEnabled ? 16 : 2,
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: 'white',
                transition: 'left 0.2s',
              }}
            />
          </button>
        </div>
        {noiseSuppressionEnabled && (
          <div style={{ marginBottom: 8 }}>
            <input
              type="range"
              min={0}
              max={100}
              value={noiseSuppressionStrength}
              onChange={(e) => setNoiseSuppressionStrength(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#00e5ff' }}
            />
            <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 9, color: 'rgba(255,255,255,0.3)', textAlign: 'right' }}>
              {noiseSuppressionStrength}%
            </div>
          </div>
        )}

        {/* EQ */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, marginTop: 4 }}>
          <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, color: 'rgba(255, 255, 255, 0.6)' }}>
            Equalizer
          </span>
          <button
            type="button"
            onClick={() => setEqEnabled(!eqEnabled)}
            style={{
              width: 32,
              height: 18,
              borderRadius: 9,
              border: 'none',
              background: eqEnabled ? '#00e5ff' : 'rgba(255, 255, 255, 0.15)',
              cursor: 'pointer',
              position: 'relative',
              transition: 'background 0.2s',
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: 2,
                left: eqEnabled ? 16 : 2,
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: 'white',
                transition: 'left 0.2s',
              }}
            />
          </button>
        </div>
        {eqEnabled && (
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { label: 'Bass', value: eqBass, set: setEqBass },
              { label: 'Mid', value: eqMid, set: setEqMid },
              { label: 'Treble', value: eqTreble, set: setEqTreble },
            ].map(({ label, value, set }) => (
              <div key={label} style={{ flex: 1, textAlign: 'center' }}>
                <input
                  type="range"
                  min={-12}
                  max={12}
                  value={value}
                  onChange={(e) => set(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#00e5ff' }}
                />
                <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 8, color: 'rgba(255,255,255,0.35)' }}>
                  {label} {value > 0 ? '+' : ''}{value}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══ Screen share settings dialog (inline) ═══ */}
      <ScreenShareSettings
        open={showShareSettings}
        onClose={() => setShowShareSettings(false)}
        onStart={handleStartShare}
      />
    </div>
  );
}
