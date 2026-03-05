'use client';
import { useEffect, useRef } from 'react';
import { Button } from '../../ui/button';
import { StepIndicator } from '../onboarding-step-indicator';
// Note: Button does not forward refs (uses motion.button internally).
// We use a wrapper div ref to locate and focus the underlying button element.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nameToHue(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return ((hash % 360) + 360) % 360;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CreateSuccessStepProps {
  hubName: string;
  onContinue: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreateSuccessStep({ hubName, onContinue }: CreateSuccessStepProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const hue = nameToHue(hubName || 'Ripcord');
  const primaryColor = `hsl(${hue}, 80%, 65%)`;
  const secondaryColor = `hsl(${(hue + 40) % 360}, 70%, 55%)`;

  // Auto-focus the continue button (Button doesn't forward refs, so query from wrapper)
  useEffect(() => {
    const btn = wrapperRef.current?.querySelector<HTMLButtonElement>('button');
    btn?.focus();
  }, []);

  // Auto-advance after 3 seconds
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
        {/* Outer glow */}
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            inset: '-40%',
            background: `radial-gradient(circle, ${primaryColor}30 0%, transparent 70%)`,
            filter: 'blur(20px)',
          }}
        />

        {/* Main SVG */}
        <svg width="100" height="100" viewBox="0 0 100 100" aria-hidden="true">
          <defs>
            <radialGradient id="success-grad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#00e5ff" />
              <stop offset="100%" stopColor="#8338ec" />
            </radialGradient>
          </defs>
          {/* Gradient circle background */}
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="url(#success-grad)"
            style={{
              filter: `drop-shadow(0 0 20px ${primaryColor}60) drop-shadow(0 0 40px ${secondaryColor}30)`,
            }}
          />
          {/* Checkmark path */}
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
          Welcome to
        </p>
        <h2
          className="font-display font-light tracking-[0.08em] uppercase select-none"
          style={{
            fontSize: '24px',
            background: 'linear-gradient(135deg, #fff 0%, #00f0ff 50%, #ff006e 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            filter: 'drop-shadow(0 0 20px rgba(0, 240, 255, 0.3))',
          }}
        >
          {hubName}
        </h2>
        <p className="font-mono text-[10px] tracking-[0.1em] text-white/30 mt-1">
          Your solar system is ready to explore
        </p>
      </div>

      {/* Step indicator */}
      <StepIndicator totalSteps={3} currentStep={3} />

      {/* Continue button */}
      <div ref={wrapperRef}>
        <Button
          onClick={onContinue}
          size="lg"
          className="min-w-[180px]"
        >
          Enter Solar System
        </Button>
      </div>
    </div>
  );
}
