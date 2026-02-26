/**
 * @module appearance-settings
 * Settings dialog for customizing the client's font size and text color.
 * All settings are local-only (persisted to localStorage via settings store).
 */
'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSettingsStore } from '../../stores/settings-store';

// ---------------------------------------------------------------------------
// Color presets
// ---------------------------------------------------------------------------

const COLOR_PRESETS = [
  { label: 'Default', value: null, hex: '#E8ECF4' },
  { label: 'Warm White', value: '#FFF5E6', hex: '#FFF5E6' },
  { label: 'Cool Blue', value: '#B8D4E3', hex: '#B8D4E3' },
  { label: 'Mint', value: '#A8E6CF', hex: '#A8E6CF' },
  { label: 'Soft Pink', value: '#FFB3BA', hex: '#FFB3BA' },
  { label: 'Lavender', value: '#C9B1FF', hex: '#C9B1FF' },
  { label: 'Gold', value: '#FFD700', hex: '#FFD700' },
  { label: 'Amber', value: '#FBBF24', hex: '#FBBF24' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface AppearanceSettingsProps {
  open: boolean;
  onClose: () => void;
}

export function AppearanceSettings({ open, onClose }: AppearanceSettingsProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const fontSize = useSettingsStore((s) => s.fontSize);
  const fontColor = useSettingsStore((s) => s.fontColor);
  const setFontSize = useSettingsStore((s) => s.setFontSize);
  const setFontColor = useSettingsStore((s) => s.setFontColor);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleMouseDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [open, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const activePreset = COLOR_PRESETS.find((p) =>
    p.value === fontColor || (p.value === null && fontColor === null),
  );

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        ref={panelRef}
        className="w-[380px] rounded-xl border border-border bg-surface-1 p-6 shadow-2xl"
      >
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">Appearance</h2>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-surface-2 hover:text-text-primary transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M1 1l12 12M13 1L1 13" />
            </svg>
          </button>
        </div>

        {/* Font Size */}
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-text-secondary">Font Size</label>
            <span className="text-sm font-medium text-text-primary">{fontSize}px</span>
          </div>
          <input
            type="range"
            min={12}
            max={20}
            step={1}
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
            className="w-full accent-accent h-1.5 cursor-pointer"
          />
          <div className="mt-1 flex justify-between text-[10px] text-text-muted">
            <span>12px</span>
            <span>16px</span>
            <span>20px</span>
          </div>
        </div>

        {/* Font Color */}
        <div className="mb-6">
          <label className="mb-2 block text-sm font-medium text-text-secondary">Text Color</label>
          <div className="flex flex-wrap gap-2">
            {COLOR_PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => setFontColor(preset.value)}
                className={`flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors ${
                  (preset.value === fontColor || (preset.value === null && fontColor === null))
                    ? 'border-accent bg-accent/10 text-text-primary'
                    : 'border-border bg-surface-2 text-text-secondary hover:border-text-muted'
                }`}
                title={preset.label}
              >
                <span
                  className="h-3.5 w-3.5 rounded-full border border-border"
                  style={{ backgroundColor: preset.hex }}
                />
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Preview */}
        <div className="mb-6 rounded-lg bg-surface-2 p-3">
          <p className="text-xs text-text-muted mb-1">Preview</p>
          <p
            className="text-text-primary"
            style={{
              fontSize: `${fontSize}px`,
              color: fontColor ?? undefined,
            }}
          >
            The quick brown fox jumps over the lazy dog.
          </p>
        </div>

        {/* Reset */}
        <button
          onClick={() => {
            setFontSize(14);
            setFontColor(null);
          }}
          className="w-full rounded-lg border border-border px-4 py-2 text-sm text-text-muted transition-colors hover:bg-surface-2 hover:text-text-secondary"
        >
          Reset to Defaults
        </button>
      </div>
    </div>,
    document.body,
  );
}
