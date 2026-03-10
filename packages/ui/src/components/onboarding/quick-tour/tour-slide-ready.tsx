/**
 * @module TourSlideReady
 * Quick Tour slide 5 — "Your Controls" wrap-up with keyboard shortcut hints.
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
          background: 'linear-gradient(135deg, #00e5ff 0%, var(--color-accent-violet) 50%, var(--color-accent-magenta) 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          filter: 'drop-shadow(0 0 20px rgba(0, 229, 255, 0.3))',
        }}
      >
        Your Controls
      </h2>

      {/* Keyboard shortcut illustration */}
      <KeyboardHintSVG className="w-[200px] mx-auto my-6" />

      {/* Primary tip */}
      <p className="font-mono text-[12px] text-white/50 max-w-md mx-auto leading-relaxed">
        Mic, deafen, and settings live in the bottom panel. Press{' '}
        <span className="text-[#00e5ff]">?</span> for keyboard shortcuts, or{' '}
        <span className="text-[#00e5ff]">Ctrl+K</span> for the Quick Switcher to jump between
        channels and solar systems instantly.
      </p>

      {/* Secondary tip */}
      <p className="font-mono text-[11px] text-white/30 max-w-md mx-auto mt-3 leading-relaxed">
        You can replay this tour anytime from Settings.
      </p>
    </div>
  );
}
