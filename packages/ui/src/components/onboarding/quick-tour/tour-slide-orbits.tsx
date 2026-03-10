/**
 * @module TourSlideOrbits
 * Quick Tour slide 3 — explains the solar system view with orbits as channels.
 */
'use client';

import { SolarSystemSVG } from '../illustrations/solar-system-svg';

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
          background: 'linear-gradient(135deg, #00e5ff 0%, var(--color-accent-violet) 50%, var(--color-accent-magenta) 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          filter: 'drop-shadow(0 0 20px rgba(0, 229, 255, 0.3))',
        }}
      >
        Solar System View
      </h2>

      {/* Solar system illustration */}
      <div className="mx-auto my-6 w-[200px] h-[200px]">
        <SolarSystemSVG className="w-full h-full" />
      </div>

      {/* Description */}
      <p className="font-mono text-[12px] text-white/50 max-w-md mx-auto mt-2 leading-relaxed">
        Each hub is a solar system. Voice channels are orbits — users appear as nodes orbiting
        the sun when they join. Drag to pan, scroll to zoom, and click orbits to interact.
      </p>
    </div>
  );
}
