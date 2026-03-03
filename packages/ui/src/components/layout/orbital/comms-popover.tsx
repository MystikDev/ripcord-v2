/**
 * @module comms-popover
 * Glass-morphism popover for audio/voice controls in the orbital view.
 * Opens upward from the COMMS button in the HUD. Sections: Voice Status,
 * Mic Toggle, Deafen Toggle, Audio Devices, Screen Share Toggle, and Disconnect.
 * Closes on click-outside or Escape.
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { useSettingsStore } from '../../../stores/settings-store';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CommsPopoverProps {
  open: boolean;
  onClose: () => void;
  /** Currently connected voice channel name, null if not in voice */
  voiceChannelName: string | null;
  /** Latency in ms or null */
  latencyMs: number | null;
  /** Mic muted state */
  isMicMuted: boolean;
  /** Deafened state */
  isDeafened: boolean;
  /** Screen sharing state */
  isScreenSharing: boolean;
  /** Callbacks */
  onMicToggle: () => void;
  onDeafenToggle: () => void;
  onScreenShareToggle: () => void;
  onDisconnect: () => void;
}

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
// Standalone Device Selector (no LiveKit context needed)
// ---------------------------------------------------------------------------

function DeviceSelect({
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
        if (!cancelled) setDevices(all.filter((d) => d.kind === kind));
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
    <div className="px-3 py-1">
      <label className="block font-mono text-[9px] uppercase tracking-wider text-white/35 mb-1">
        {label}
      </label>
      <select
        value={selectedId ?? ''}
        onChange={(e) => onSelect(e.target.value || null)}
        className="w-full rounded-md px-2 py-1.5 font-mono text-[10px] outline-none cursor-pointer"
        style={{
          border: '1px solid rgba(255, 255, 255, 0.1)',
          background: 'rgba(255, 255, 255, 0.05)',
          color: 'rgba(255, 255, 255, 0.85)',
        }}
      >
        <option value="">System Default</option>
        {devices.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || `${kind === 'audioinput' ? 'Mic' : 'Speaker'} ${d.deviceId.slice(0, 8)}`}
          </option>
        ))}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audio Devices Section
// ---------------------------------------------------------------------------

function AudioDevices() {
  const selectedMicId = useSettingsStore((s) => s.selectedMicDeviceId);
  const setSelectedMicId = useSettingsStore((s) => s.setSelectedMicDeviceId);
  const selectedSpeakerId = useSettingsStore((s) => s.selectedSpeakerDeviceId);
  const setSelectedSpeakerId = useSettingsStore((s) => s.setSelectedSpeakerDeviceId);

  return (
    <div className="py-1">
      <DeviceSelect label="Input" kind="audioinput" selectedId={selectedMicId} onSelect={setSelectedMicId} />
      <DeviceSelect label="Output" kind="audiooutput" selectedId={selectedSpeakerId} onSelect={setSelectedSpeakerId} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CommsPopover({
  open,
  onClose,
  voiceChannelName,
  latencyMs,
  isMicMuted,
  isDeafened,
  isScreenSharing,
  onMicToggle,
  onDeafenToggle,
  onScreenShareToggle,
  onDisconnect,
}: CommsPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const isInVoice = voiceChannelName !== null;

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay to avoid the opening click triggering close
    const timer = setTimeout(() => {
      window.addEventListener('pointerdown', handler);
    }, 100);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointerdown', handler);
    };
  }, [open, onClose]);

  const handleDisconnect = useCallback(() => {
    onDisconnect();
    onClose();
  }, [onDisconnect, onClose]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2"
      style={{
        width: 240,
        background: 'rgba(7, 9, 13, 0.95)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 12,
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.5)',
        padding: '10px 0',
        zIndex: 300,
      }}
    >
      {/* ── Voice Status ── */}
      {isInVoice && (
        <div className="px-3 pb-2 mb-1 border-b border-white/8">
          <div className="flex items-center gap-2">
            <span className="w-[6px] h-[6px] rounded-full bg-[#34d399] shrink-0" />
            <span className="font-mono text-[11px] text-[#34d399] truncate">
              {voiceChannelName}
            </span>
          </div>
          {latencyMs !== null && (
            <div className="flex items-center gap-1.5 mt-1">
              <span className="font-mono text-[9px] text-white/40 uppercase tracking-wider">
                Latency
              </span>
              <span
                className="font-mono text-[10px] font-bold"
                style={{ color: latencyColor(latencyMs) }}
              >
                {latencyMs}ms
              </span>
              <span
                className="font-mono text-[9px]"
                style={{ color: latencyColor(latencyMs), opacity: 0.7 }}
              >
                ({latencyLabel(latencyMs)})
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Mic Toggle ── */}
      <button
        type="button"
        onClick={onMicToggle}
        className={clsx(
          'w-full flex items-center gap-3 px-3 py-2 text-left',
          'transition-colors duration-100 cursor-pointer',
          'hover:bg-white/5',
        )}
      >
        <div
          className={clsx(
            'w-[28px] h-[28px] rounded-lg flex items-center justify-center shrink-0',
            isMicMuted ? 'bg-red-500/15 text-red-400' : 'bg-white/8 text-white/70',
          )}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="5" y="1" width="4" height="8" rx="2" stroke="currentColor" strokeWidth="1.3" />
            <path d="M3 6.5a4 4 0 0 0 8 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            <line x1="7" y1="11" x2="7" y2="13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            {isMicMuted && <line x1="2" y1="12" x2="12" y2="2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />}
          </svg>
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-mono text-[11px] text-white/85">Microphone</span>
          <span className={clsx('font-mono text-[9px]', isMicMuted ? 'text-red-400' : 'text-white/40')}>
            {isMicMuted ? 'Muted' : 'Active'}
          </span>
        </div>
      </button>

      {/* ── Deafen Toggle ── */}
      <button
        type="button"
        onClick={onDeafenToggle}
        className={clsx(
          'w-full flex items-center gap-3 px-3 py-2 text-left',
          'transition-colors duration-100 cursor-pointer',
          'hover:bg-white/5',
        )}
      >
        <div
          className={clsx(
            'w-[28px] h-[28px] rounded-lg flex items-center justify-center shrink-0',
            isDeafened ? 'bg-red-500/15 text-red-400' : 'bg-white/8 text-white/70',
          )}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 5.5v3a1 1 0 0 0 1 1h1l3 2.5V3L5 5.5H4a1 1 0 0 0-1 1Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            {!isDeafened && (
              <>
                <path d="M10 5c.6.5 1 1.2 1 2s-.4 1.5-1 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                <path d="M11.5 3.5c1 .8 1.5 2 1.5 3.5s-.5 2.7-1.5 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </>
            )}
            {isDeafened && <line x1="2" y1="12" x2="12" y2="2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />}
          </svg>
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-mono text-[11px] text-white/85">Audio Output</span>
          <span className={clsx('font-mono text-[9px]', isDeafened ? 'text-red-400' : 'text-white/40')}>
            {isDeafened ? 'Deafened' : 'Active'}
          </span>
        </div>
      </button>

      {/* ── Audio Devices ── */}
      <div className="mx-3 my-1 border-t border-white/8" />
      <AudioDevices />

      {/* ── Screen Share Toggle ── */}
      {isInVoice && (
        <>
        <div className="mx-3 my-1 border-t border-white/8" />
        <button
          type="button"
          onClick={onScreenShareToggle}
          className={clsx(
            'w-full flex items-center gap-3 px-3 py-2 text-left',
            'transition-colors duration-100 cursor-pointer',
            'hover:bg-white/5',
          )}
        >
          <div
            className={clsx(
              'w-[28px] h-[28px] rounded-lg flex items-center justify-center shrink-0',
              isScreenSharing ? 'bg-blue-500/15 text-blue-400' : 'bg-white/8 text-white/70',
            )}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="2" width="12" height="8" rx="1" stroke="currentColor" strokeWidth="1.3" />
              <line x1="5" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              <line x1="7" y1="10" x2="7" y2="12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-mono text-[11px] text-white/85">Screen Share</span>
            <span className={clsx('font-mono text-[9px]', isScreenSharing ? 'text-blue-400' : 'text-white/40')}>
              {isScreenSharing ? 'Sharing' : 'Off'}
            </span>
          </div>
        </button>
        </>
      )}

      {/* ── Disconnect ── */}
      {isInVoice && (
        <>
          <div className="mx-3 my-1 border-t border-white/8" />
          <button
            type="button"
            onClick={handleDisconnect}
            className={clsx(
              'w-full flex items-center gap-3 px-3 py-2 text-left',
              'transition-colors duration-100 cursor-pointer',
              'hover:bg-red-500/10',
            )}
          >
            <div className="w-[28px] h-[28px] rounded-lg flex items-center justify-center shrink-0 bg-red-500/15 text-red-400">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M1.5 6c1-2.5 3.5-4 5.5-4s4.5 1.5 5.5 4l-1.5 1.5c-.3.3-.7.3-1 .1L8.5 6.5a.5.5 0 0 1-.2-.4V4.5a6.3 6.3 0 0 0-2.6 0v1.6c0 .15-.07.3-.2.4L4 7.6c-.3.2-.7.2-1-.1L1.5 6Z"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <span className="font-mono text-[11px] text-red-400">Disconnect</span>
          </button>
        </>
      )}
    </div>
  );
}
