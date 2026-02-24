/**
 * @module signal-meter
 * Cell-signal-style four-bar latency indicator. Bar color escalates from
 * green to yellow to red based on connection quality, with a tooltip
 * displaying the numeric millisecond value.
 */
'use client';

import clsx from 'clsx';
import { Tooltip } from '../ui/tooltip';
import type { LatencyQuality } from '../../hooks/use-voice-latency';

// ---------------------------------------------------------------------------
// SignalMeter
//
// Renders 4 ascending vertical bars (cell-signal style) color-coded by voice
// latency quality. Hover shows the actual ms value in a tooltip.
// ---------------------------------------------------------------------------

interface SignalMeterProps {
  latencyMs: number | null;
  quality: LatencyQuality;
}

const QUALITY_COLOR: Record<LatencyQuality, string> = {
  excellent: 'text-success',
  good: 'text-success',
  poor: 'text-warning',
  unknown: 'text-text-muted',
};

/** For very high latency (>=250ms) escalate to red. */
function getColor(quality: LatencyQuality, ms: number | null): string {
  if (quality === 'poor' && ms !== null && ms >= 250) return 'text-danger';
  return QUALITY_COLOR[quality];
}

/** Number of bars to fill: excellent=4, good=3, poor=2, unknown=0. */
function getFilledBars(quality: LatencyQuality): number {
  switch (quality) {
    case 'excellent': return 4;
    case 'good': return 3;
    case 'poor': return 2;
    case 'unknown': return 0;
  }
}

function getTooltipText(latencyMs: number | null, quality: LatencyQuality): string {
  if (latencyMs === null) return 'Measuring latency…';
  return `${latencyMs}ms — ${quality}`;
}

/** Bar heights in px, shortest to tallest (left to right). */
const BAR_HEIGHTS = [3, 5, 7, 9];

export function SignalMeter({ latencyMs, quality }: SignalMeterProps) {
  const filled = getFilledBars(quality);
  const color = getColor(quality, latencyMs);

  return (
    <Tooltip content={getTooltipText(latencyMs, quality)} side="top">
      <div
        className={clsx('flex items-end gap-[2px] cursor-default', color)}
        role="img"
        aria-label={`Voice latency: ${latencyMs !== null ? `${latencyMs}ms` : 'unknown'}`}
      >
        {BAR_HEIGHTS.map((h, i) => (
          <span
            key={i}
            className={clsx(
              'w-[3px] rounded-[0.5px] transition-opacity duration-300',
              i < filled ? 'opacity-100 bg-current' : 'opacity-25 bg-current',
            )}
            style={{ height: `${h}px` }}
          />
        ))}
      </div>
    </Tooltip>
  );
}
