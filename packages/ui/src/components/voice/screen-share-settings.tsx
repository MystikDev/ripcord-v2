'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { useSettingsStore } from '../../stores/settings-store';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScreenShareOptions {
  resolution?: { width: number; height: number };
  frameRate: number;
  audio: boolean;
  contentHint: 'detail' | 'motion';
}

interface ScreenShareSettingsProps {
  open: boolean;
  onClose: () => void;
  onStart: (options: ScreenShareOptions) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RESOLUTION_MAP: Record<string, { width: number; height: number } | undefined> = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '1440p': { width: 2560, height: 1440 },
  source: undefined,
};

type Resolution = '720p' | '1080p' | '1440p' | 'source';
type FrameRate = 15 | 30 | 60;
type ContentHint = 'detail' | 'motion';

const RESOLUTIONS: { value: Resolution; label: string }[] = [
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' },
  { value: '1440p', label: '1440p' },
  { value: 'source', label: 'Source' },
];

const FRAME_RATES: { value: FrameRate; label: string }[] = [
  { value: 15, label: '15 fps' },
  { value: 30, label: '30 fps' },
  { value: 60, label: '60 fps' },
];

const CONTENT_HINTS: { value: ContentHint; label: string; description: string }[] = [
  {
    value: 'detail',
    label: 'Detail',
    description: 'Optimised for text and static content. Higher resolution, lower frame rate.',
  },
  {
    value: 'motion',
    label: 'Motion',
    description: 'Optimised for video and animation. Higher frame rate, adaptive resolution.',
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ScreenShareSettings({ open, onClose, onStart }: ScreenShareSettingsProps) {
  const store = useSettingsStore();

  // Local state initialised from the persisted store values.
  const [resolution, setResolution] = useState<Resolution>(store.screenShareResolution);
  const [frameRate, setFrameRate] = useState<FrameRate>(store.screenShareFrameRate);
  const [audio, setAudio] = useState<boolean>(store.screenShareAudio);
  const [contentHint, setContentHint] = useState<ContentHint>(store.screenShareContentHint);

  // Re-sync local state whenever the dialog opens so we always reflect the
  // latest persisted values.
  useEffect(() => {
    if (open) {
      setResolution(store.screenShareResolution);
      setFrameRate(store.screenShareFrameRate);
      setAudio(store.screenShareAudio);
      setContentHint(store.screenShareContentHint);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Close on Escape key.
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleStart = () => {
    // Persist selections to the settings store.
    store.setScreenShareResolution(resolution);
    store.setScreenShareFrameRate(frameRate);
    store.setScreenShareAudio(audio);
    store.setScreenShareContentHint(contentHint);

    onStart({
      resolution: RESOLUTION_MAP[resolution],
      frameRate,
      audio,
      contentHint,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-surface-1 rounded-lg border border-border p-6 max-w-md mx-auto mt-[20vh]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Screen Share Settings"
      >
        <h2 className="text-lg font-semibold text-text-primary mb-4">
          Screen Share Settings
        </h2>

        {/* ---- Resolution ---- */}
        <div className="mb-4">
          <label className="text-sm font-medium text-text-primary mb-2 block">
            Resolution
          </label>
          <div className="flex gap-2">
            {RESOLUTIONS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setResolution(r.value)}
                className={clsx(
                  'px-3 py-1.5 rounded text-sm transition-colors',
                  resolution === r.value
                    ? 'bg-accent text-white'
                    : 'bg-surface-2 text-text-secondary hover:bg-surface-3',
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* ---- Frame Rate ---- */}
        <div className="mb-4">
          <label className="text-sm font-medium text-text-primary mb-2 block">
            Frame Rate
          </label>
          <div className="flex gap-2">
            {FRAME_RATES.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFrameRate(f.value)}
                className={clsx(
                  'px-3 py-1.5 rounded text-sm transition-colors',
                  frameRate === f.value
                    ? 'bg-accent text-white'
                    : 'bg-surface-2 text-text-secondary hover:bg-surface-3',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* ---- Content Type ---- */}
        <div className="mb-4">
          <label className="text-sm font-medium text-text-primary mb-2 block">
            Content Type
          </label>
          <div className="flex flex-col gap-2">
            {CONTENT_HINTS.map((h) => (
              <button
                key={h.value}
                type="button"
                onClick={() => setContentHint(h.value)}
                className={clsx(
                  'text-left px-3 py-2 rounded border transition-colors',
                  contentHint === h.value
                    ? 'bg-accent text-white border-accent'
                    : 'bg-surface-2 text-text-secondary border-transparent hover:bg-surface-3',
                )}
              >
                <span className="text-sm font-medium">{h.label}</span>
                <span
                  className={clsx(
                    'block text-xs mt-0.5',
                    contentHint === h.value ? 'text-white/80' : 'text-text-tertiary',
                  )}
                >
                  {h.description}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ---- Audio Capture ---- */}
        <div className="mb-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={audio}
              onChange={(e) => setAudio(e.target.checked)}
              className="accent-accent"
            />
            <span className="text-sm text-text-primary">Capture audio</span>
          </label>
        </div>

        {/* ---- Actions ---- */}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="bg-surface-2 hover:bg-surface-3 text-text-primary px-4 py-2 rounded text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleStart}
            className="bg-accent hover:bg-accent/90 text-white px-4 py-2 rounded text-sm transition-colors"
          >
            Start Share
          </button>
        </div>
      </div>
    </div>
  );
}
