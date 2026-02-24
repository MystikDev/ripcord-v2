/**
 * @module audio-settings
 * Settings dialog for audio device selection (microphone and speaker via LiveKit)
 * with a noise suppression toggle and strength slider.
 */
'use client';

import { useState } from 'react';
import { useMediaDeviceSelect } from '@livekit/components-react';
import { Dialog, DialogTrigger, DialogContent } from '../ui/dialog';
import { Separator } from '../ui/separator';
import { Tooltip } from '../ui/tooltip';
import { useSettingsStore } from '../../stores/settings-store';
import clsx from 'clsx';

// ---------------------------------------------------------------------------
// Device Selector
// ---------------------------------------------------------------------------

function DeviceSelector({
  kind,
  label,
  onDeviceChange,
}: {
  kind: MediaDeviceKind;
  label: string;
  onDeviceChange?: (deviceId: string) => void;
}) {
  const { devices, activeDeviceId, setActiveMediaDevice } = useMediaDeviceSelect({
    kind,
    requestPermissions: true,
  });

  const handleChange = (id: string) => {
    setActiveMediaDevice(id);
    onDeviceChange?.(id);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-text-secondary">{label}</label>
      <select
        value={activeDeviceId}
        onChange={(e) => handleChange(e.target.value)}
        className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
      >
        {devices.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || `Device ${d.deviceId.slice(0, 8)}`}
          </option>
        ))}
        {devices.length === 0 && (
          <option value="">No devices found</option>
        )}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Noise Suppression Controls
// ---------------------------------------------------------------------------

function NoiseSuppression() {
  const enabled = useSettingsStore((s) => s.noiseSuppressionEnabled);
  const strength = useSettingsStore((s) => s.noiseSuppressionStrength);
  const setEnabled = useSettingsStore((s) => s.setNoiseSuppressionEnabled);
  const setStrength = useSettingsStore((s) => s.setNoiseSuppressionStrength);

  const strengthLabel =
    strength === 0 ? 'Off' : strength <= 33 ? 'Low' : strength <= 66 ? 'Medium' : 'High';

  return (
    <div className="flex flex-col gap-2">
      {/* Toggle row */}
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-text-secondary">
          Noise Suppression
        </label>
        <button
          onClick={() => setEnabled(!enabled)}
          className={clsx(
            'relative h-5 w-9 rounded-full transition-colors',
            enabled ? 'bg-accent' : 'bg-surface-3',
          )}
          role="switch"
          aria-checked={enabled}
        >
          <span
            className={clsx(
              'absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform',
              enabled && 'translate-x-4',
            )}
          />
        </button>
      </div>

      {/* Strength slider (only visible when enabled) */}
      {enabled && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-text-muted">Strength</span>
            <span className="text-[11px] font-medium text-text-secondary">
              {strengthLabel}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={strength}
            onChange={(e) => setStrength(Number(e.target.value))}
            className="w-full accent-accent h-1.5 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-text-muted">
            <span>Off</span>
            <span>Low</span>
            <span>Medium</span>
            <span>High</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings Icon
// ---------------------------------------------------------------------------

function SettingsIcon() {
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
      <path d="M6.86 1.5h2.28l.35 1.75a5.5 5.5 0 011.32.77l1.7-.57 1.14 1.97-1.35 1.18a5.6 5.6 0 010 1.54l1.35 1.18-1.14 1.97-1.7-.57a5.5 5.5 0 01-1.32.77l-.35 1.75H6.86l-.35-1.75a5.5 5.5 0 01-1.32-.77l-1.7.57-1.14-1.97 1.35-1.18a5.6 5.6 0 010-1.54L2.35 5.42l1.14-1.97 1.7.57a5.5 5.5 0 011.32-.77L6.86 1.5z" />
      <circle cx="8" cy="8" r="2" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Audio Settings Dialog
// ---------------------------------------------------------------------------

export function AudioSettings() {
  const [open, setOpen] = useState(false);
  const setMicId = useSettingsStore((s) => s.setSelectedMicDeviceId);
  const setSpeakerId = useSettingsStore((s) => s.setSelectedSpeakerDeviceId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip content="Audio Settings" side="top">
        <DialogTrigger asChild>
          <button className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-3 text-text-secondary hover:bg-surface-2 hover:text-text-primary transition-colors">
            <SettingsIcon />
          </button>
        </DialogTrigger>
      </Tooltip>
      <DialogContent
        title="Audio Settings"
        description="Select your microphone and speaker devices."
      >
        <div className="flex flex-col gap-4 py-2">
          <DeviceSelector kind="audioinput" label="Microphone" onDeviceChange={setMicId} />
          <DeviceSelector kind="audiooutput" label="Speaker" onDeviceChange={setSpeakerId} />
          <Separator />
          <NoiseSuppression />
        </div>
      </DialogContent>
    </Dialog>
  );
}
