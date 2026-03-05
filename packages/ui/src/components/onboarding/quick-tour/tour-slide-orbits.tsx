/**
 * @module TourSlideOrbits
 * Quick Tour slide 2 — explains the three channel types via orbit diagrams.
 */
'use client';

import { OrbitDiagramSVG } from '../illustrations/orbit-diagram-svg';

// ---------------------------------------------------------------------------
// Orbit diagram variants with labels
// ---------------------------------------------------------------------------

const ORBIT_ITEMS = [
  { variant: 'channels' as const, label: 'Text Channels' },
  { variant: 'voice' as const,    label: 'Voice Channels' },
  { variant: 'chat' as const,     label: 'Floating Chat' },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TourSlideOrbits() {
  return (
    <div className="p-8 text-center">
      {/* Title */}
      <h2
        className="font-display font-light tracking-[0.15em] uppercase select-none"
        style={{
          fontSize: '22px',
          background: 'linear-gradient(135deg, #00e5ff 0%, #8338ec 50%, #ff006e 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          filter: 'drop-shadow(0 0 20px rgba(0, 229, 255, 0.3))',
        }}
      >
        Orbits Are Channels
      </h2>

      {/* Three orbit diagram mini-illustrations */}
      <div className="flex justify-center gap-6 my-6">
        {ORBIT_ITEMS.map(({ variant, label }) => (
          <div key={variant} className="flex flex-col items-center gap-2">
            <OrbitDiagramSVG variant={variant} className="w-[80px] h-[80px]" />
            <span className="font-mono text-[10px] text-white/40 uppercase tracking-wider">
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* Description */}
      <p className="font-mono text-[12px] text-white/50 max-w-md mx-auto mt-4 leading-relaxed">
        Each orbit ring is a channel. Join voice by clicking a voice orbit, or open text chat
        from any channel.
      </p>
    </div>
  );
}
