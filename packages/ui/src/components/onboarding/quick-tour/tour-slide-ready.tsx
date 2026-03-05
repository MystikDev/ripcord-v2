/**
 * @module TourSlideReady
 * Quick Tour slide 3 — "You're ready!" wrap-up with keyboard shortcut hint.
 */
'use client';

import { KeyboardHintSVG } from '../illustrations/keyboard-hint-svg';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TourSlideReady() {
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
        You're Ready
      </h2>

      {/* Keyboard shortcut illustration */}
      <KeyboardHintSVG className="w-[200px] mx-auto my-6" />

      {/* Primary tip */}
      <p className="font-mono text-[12px] text-white/50 max-w-md mx-auto leading-relaxed">
        Press <span className="text-[#00e5ff]">Ctrl+K</span> anytime for the Quick Switcher
        — jump between channels, solar systems, and friends instantly.
      </p>

      {/* Secondary tip */}
      <p className="font-mono text-[11px] text-white/30 max-w-md mx-auto mt-3 leading-relaxed">
        Drag to pan, scroll to zoom in the orbital view.
      </p>
    </div>
  );
}
