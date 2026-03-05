/**
 * @module JoinSuccessStep
 * Step 3 of the Join path — success confirmation after the user has
 * successfully joined a hub. Auto-advances to onContinue after 3 seconds.
 */
'use client';

import { useEffect } from 'react';
import { Button } from '../../ui/button';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface JoinSuccessStepProps {
  hubName: string;
  onContinue: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function JoinSuccessStep({ hubName, onContinue }: JoinSuccessStepProps) {
  // Auto-advance after 3 s; cleaned up if component unmounts early.
  useEffect(() => {
    const timer = setTimeout(onContinue, 3000);
    return () => clearTimeout(timer);
  }, [onContinue]);

  return (
    <div
      className="flex flex-col items-center justify-center min-h-full px-8 py-12 gap-8"
      style={{ animation: 'onboard-slide-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) both' }}
    >
      {/* Success burst circle with checkmark */}
      <div
        className="relative flex items-center justify-center"
        style={{
          animation: 'onboard-success-burst 0.6s cubic-bezier(0.16, 1, 0.3, 1) both',
        }}
      >
        {/* Outer glow halo */}
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            inset: '-40%',
            background:
              'radial-gradient(circle, rgba(0,229,255,0.25) 0%, rgba(131,56,236,0.12) 50%, transparent 70%)',
            filter: 'blur(20px)',
          }}
        />

        {/* SVG: gradient circle + checkmark */}
        <svg width="100" height="100" viewBox="0 0 100 100" aria-hidden="true">
          <defs>
            <radialGradient id="join-success-grad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#00e5ff" />
              <stop offset="100%" stopColor="#8338ec" />
            </radialGradient>
          </defs>

          {/* Gradient-filled circle */}
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="url(#join-success-grad)"
            style={{
              filter:
                'drop-shadow(0 0 20px rgba(0,229,255,0.5)) drop-shadow(0 0 40px rgba(131,56,236,0.25))',
            }}
          />

          {/* Checkmark */}
          <path
            d="M 28 50 L 44 66 L 72 34"
            stroke="white"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </div>

      {/* Success text */}
      <div className="text-center flex flex-col gap-2">
        <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-white/50">
          You've Joined
        </p>
        <h2
          className="font-display font-light tracking-[0.08em] uppercase select-none"
          style={{
            fontSize: '24px',
            background: 'linear-gradient(135deg, #00e5ff 0%, #8338ec 50%, #ff006e 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            filter: 'drop-shadow(0 0 20px rgba(0, 229, 255, 0.3))',
          }}
        >
          {hubName}
        </h2>
        <p className="font-mono text-[10px] tracking-[0.1em] text-white/30 mt-1">
          Your new solar system is ready to explore
        </p>
      </div>

      {/* Continue button */}
      <Button onClick={onContinue} size="lg" className="min-w-[180px]">
        Continue
      </Button>
    </div>
  );
}
