/**
 * @module effect-controls
 * Parameter controls for a single audio effect instance.
 * Renders sliders for each parameter with labels and current values.
 */
'use client';

import type { EffectParam } from '../../lib/audio-effects/effect-types';
import clsx from 'clsx';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatParamValue(value: number, unit?: string): string {
  // Format value with appropriate precision
  let formatted: string;
  if (Math.abs(value) >= 100) {
    formatted = Math.round(value).toString();
  } else if (Math.abs(value) >= 1) {
    formatted = value.toFixed(1);
  } else {
    formatted = value.toFixed(3);
  }

  if (!unit) return formatted;

  switch (unit) {
    case '%':
      return `${Math.round(value * 100)}%`;
    case 'dB':
      return value > 0 ? `+${formatted} dB` : `${formatted} dB`;
    case 'x':
      return `${formatted}:1`;
    case 's':
      return value >= 1 ? `${formatted}s` : `${Math.round(value * 1000)}ms`;
    case 'Hz':
      return value >= 1000 ? `${(value / 1000).toFixed(1)}kHz` : `${Math.round(value)}Hz`;
    case 'Q':
      return `Q ${formatted}`;
    default:
      return `${formatted} ${unit}`;
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface EffectControlsProps {
  params: Record<string, EffectParam>;
  onParamChange: (key: string, value: number) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EffectControls({ params, onParamChange }: EffectControlsProps) {
  return (
    <div className="flex flex-col gap-2.5 px-1">
      {Object.entries(params).map(([key, param]) => (
        <div key={key} className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-text-muted">{param.label}</span>
            <span className="text-[11px] font-medium text-text-secondary">
              {formatParamValue(param.value, param.unit)}
            </span>
          </div>
          <input
            type="range"
            min={param.min}
            max={param.max}
            step={param.step}
            value={param.value}
            onChange={(e) => onParamChange(key, Number(e.target.value))}
            className="w-full accent-accent h-1.5 cursor-pointer"
          />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bypass Toggle (shared switch style)
// ---------------------------------------------------------------------------

export function BypassToggle({
  bypassed,
  onToggle,
}: {
  bypassed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={clsx(
        'relative h-4 w-7 rounded-full transition-colors shrink-0',
        !bypassed ? 'bg-accent' : 'bg-surface-3',
      )}
      role="switch"
      aria-checked={!bypassed}
      aria-label="Toggle effect"
    >
      <span
        className={clsx(
          'absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white transition-transform',
          !bypassed && 'translate-x-3',
        )}
      />
    </button>
  );
}
